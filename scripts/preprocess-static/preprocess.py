#!/usr/bin/env python3
"""
Turn a large global raster (VIIRS night lights or SEDAC population density) into the
small 0.25-degree grid file the backend reads. Run once per data release, offline.

    pip install -r scripts/preprocess-static/requirements.txt
    python scripts/preprocess-static/preprocess.py light-pollution  --input VNL_2024.tif --year 2024
    python scripts/preprocess-static/preprocess.py population       --input gpw_density_2020.tif --year 2020

Writes two files to data/static/ (or --out-dir):
    <name>.bin   float32, little-endian, row-major, 720 rows x 1440 cols.
                 Row 0 is the SOUTHERNMOST band (-90 to -89.75), column 0 starts at -180.
                 That matches backend/src/lib/grid.ts, so a cell's row/col index the file directly.
                 NaN means no data (ocean, outside the source's coverage).
    <name>.json  metadata: grid size, units, source, year.

Which source files to use:
  * light-pollution: an annual VIIRS VNL "average_masked" GeoTIFF from the Earth Observation Group
    (https://eogdata.mines.edu/products/vnl/), in nW/cm2/sr. Needs a free EOG account.
  * population: a SEDAC GPWv4 "population density" GeoTIFF (persons per km2), NOT the "count"
    product (counts must be summed, not averaged). Needs a free Earthdata login.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject

GRID_SIZE_DEG = 0.25  # keep equal to DEFAULT_CELL_SIZE_DEG in backend/src/lib/grid.ts
ROWS = int(180 / GRID_SIZE_DEG)
COLS = int(360 / GRID_SIZE_DEG)
FORMAT = "vantage-grid-v1"

DATASETS = {
    "light-pollution": {
        "file": "light_pollution",
        "units": "nW/cm2/sr",
        "source": "VIIRS VNL annual composite (Earth Observation Group)",
        "min_valid": 0.0,  # small negative radiances are sensor noise
    },
    "population": {
        "file": "population_density",
        "units": "persons/km2",
        "source": "SEDAC GPWv4 population density",
        "min_valid": 0.0,
    },
}


def regrid(input_path: Path) -> np.ndarray:
    """Average the source raster into the global 0.25-degree grid, north row first."""
    destination = np.full((ROWS, COLS), np.nan, dtype=np.float32)
    with rasterio.open(input_path) as src:
        if src.crs is None:
            sys.exit(f"{input_path} has no coordinate system; expected EPSG:4326 (lat/lng).")
        reproject(
            source=rasterio.band(src, 1),
            destination=destination,
            src_nodata=src.nodata,
            dst_transform=from_origin(-180.0, 90.0, GRID_SIZE_DEG, GRID_SIZE_DEG),
            dst_crs=CRS.from_epsg(4326),
            dst_nodata=np.nan,
            # Average of the fine pixels inside each coarse cell; GDAL streams the source in chunks,
            # so a multi-gigabyte input doesn't have to fit in memory.
            resampling=Resampling.average,
        )
    return destination


def write_grid(values_north_first: np.ndarray, dataset: str, year: int | None, out_dir: Path) -> Path:
    spec = DATASETS[dataset]
    values = values_north_first.astype(np.float32)
    values = np.where(np.isfinite(values) & (values < spec["min_valid"]), spec["min_valid"], values)
    south_first = np.flipud(values)

    out_dir.mkdir(parents=True, exist_ok=True)
    bin_path = out_dir / f"{spec['file']}.bin"
    south_first.astype("<f4").tofile(bin_path)

    finite = south_first[np.isfinite(south_first)]
    meta = {
        "format": FORMAT,
        "dataset": dataset,
        "sizeDeg": GRID_SIZE_DEG,
        "rows": ROWS,
        "cols": COLS,
        "dtype": "float32-le",
        "rowOrder": "south-to-north",
        "nodata": "NaN",
        "units": spec["units"],
        "source": spec["source"],
        "year": year,
        "cellsWithData": int(finite.size),
        "max": float(finite.max()) if finite.size else None,
    }
    (out_dir / f"{spec['file']}.json").write_text(json.dumps(meta, indent=2) + "\n")
    return bin_path


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dataset", choices=sorted(DATASETS))
    parser.add_argument("--input", required=True, type=Path, help="source GeoTIFF")
    parser.add_argument("--year", type=int, default=None, help="year of the source data")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "static",
        help="output folder (default: data/static at the repo root)",
    )
    args = parser.parse_args(argv)

    if not args.input.exists():
        sys.exit(f"Input not found: {args.input}")
    grid = regrid(args.input)
    path = write_grid(grid, args.dataset, args.year, args.out_dir)
    cells = int(np.isfinite(grid).sum())
    print(f"Wrote {path} and its .json ({cells:,} of {ROWS * COLS:,} cells have data).")


if __name__ == "__main__":
    main()

import RandomButton from '../RandomButton/RandomButton';
import SavedLocations from '../favorites/SavedLocations';
import type { MapSelection } from '../../types';

interface DefaultStateProps {
  onSelect: (selection: MapSelection) => void;
  onRequestLogin?: () => void;
}

/** What the dashboard shows when no location is selected: Random button + Saved Locations. */
export default function DefaultState({ onSelect, onRequestLogin }: DefaultStateProps) {
  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-sm text-slate-400">
        Click anywhere on the globe, search for a place, or jump to a random spot to see live conditions.
      </p>
      <RandomButton onSelect={onSelect} />
      <SavedLocations onSelect={onSelect} onRequestLogin={onRequestLogin} />
    </div>
  );
}

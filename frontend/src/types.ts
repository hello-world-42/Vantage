/** A point the user picked, either by clicking the globe or choosing a search result. */
export interface MapSelection {
  lat: number;
  lng: number;
  /** Present for search results; clicked points have no name until reverse geocoding exists. */
  name?: string;
  source: 'click' | 'search';
}

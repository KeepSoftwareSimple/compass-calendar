/**
 * Required when showing Places Autocomplete results without a Google Map.
 * See Google Maps Platform Places attribution requirements.
 */
export function GoogleMapsAttribution() {
  return (
    <p
      className="px-3 pt-0.5 pb-1.5 text-right text-text-subtle text-xs"
      translate="no"
    >
      Google Maps
    </p>
  );
}

/**
 * Whether a failed upload's reservation is spent. The server quarantines an upload whose content it refused (422) or
 * whose time ran out (410), and a finished or discarded one answers FILE_STATE: sending the file to the same asset
 * again can never succeed, so a retry must reserve a new one. A busy asset, a network drop or a storage outage keep
 * the reservation, and the retry resends to it.
 */
export function uploadSpent(error){
  if(!error||error.name==='AbortError')return false;
  return error.status===410||error.status===422||error.status===403||(error.status===409&&error.code==='FILE_STATE');
}

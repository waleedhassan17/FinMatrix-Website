import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { locationRef } from '@/test/locationRef';

/** Records the router's location for the test, after each navigation. */
export function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    locationRef.current = { pathname: location.pathname, search: location.search };
  }, [location]);
  return null;
}

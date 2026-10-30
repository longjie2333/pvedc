import { Navigate, useLocation } from 'react-router-dom';

/** A role's catch-all: return to the deep link remembered at sign-in if it belongs to that role. */
export function ReturnTo({ area, fallback }: { area: '/admin/' | '/student/'; fallback: string }) {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return <Navigate replace to={from?.startsWith(area) ? from : fallback} />;
}

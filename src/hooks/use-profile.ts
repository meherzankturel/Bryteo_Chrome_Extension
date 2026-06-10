import { useQuery } from '@tanstack/react-query';
import { getMyProfile } from '../api/profile';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: getMyProfile,
    staleTime: 60_000,
    refetchInterval: 60_000
  });
}

type QuerySnapshot<T> = {
  data: T | undefined; error: Error | null; isError: boolean; isPending: boolean;
  isFetching: boolean; isRefetching: boolean; refetch: () => Promise<unknown>;
};
type Shared<T> = { data: T | undefined; isFetching: boolean; isRefetching: boolean; refetch: () => Promise<unknown> };
export type LibraryResult<T> = Shared<T> & (
  | { status: 'pending'; error: null; isPending: true; isError: false; isSuccess: false; isLoading: boolean; isLoadingError: false; isRefetchError: false }
  | { status: 'error'; error: Error; isPending: false; isError: true; isSuccess: false; isLoading: false; isLoadingError: boolean; isRefetchError: boolean }
  | { status: 'success'; error: null; isPending: false; isError: false; isSuccess: true; isLoading: false; isLoadingError: false; isRefetchError: false }
);

/** Derive all screen status flags together instead of partially overriding a Query result. */
export function libraryResult<T>(query: QuerySnapshot<T>, options: { fallback?: T; cloudError?: string; cloudPending?: boolean; cloudLoading?: boolean }): LibraryResult<T> {
  const data = query.data ?? options.fallback;
  const isFetching = query.isFetching || !!options.cloudLoading;
  const shared = { data, isFetching, refetch: query.refetch };
  const error = query.isError ? query.error : options.cloudError ? new Error(options.cloudError) : null;
  if (query.isError || error) {
    return { ...shared, status: 'error', error: error ?? new Error('음악 목록을 불러오지 못했습니다.'), isPending: false, isError: true, isSuccess: false, isLoading: false,
      isLoadingError: data === undefined, isRefetchError: data !== undefined, isRefetching: isFetching && data !== undefined };
  }
  if (query.isPending || options.cloudPending) {
    return { ...shared, status: 'pending', error: null, isPending: true, isError: false, isSuccess: false, isLoading: isFetching,
      isLoadingError: false, isRefetchError: false, isRefetching: false };
  }
  return { ...shared, status: 'success', error: null, isPending: false, isError: false, isSuccess: true, isLoading: false,
    isLoadingError: false, isRefetchError: false, isRefetching: query.isRefetching || (!!options.cloudLoading && data !== undefined) };
}

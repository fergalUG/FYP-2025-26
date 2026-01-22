export const executeWithLoading = async <T>(
  operation: () => Promise<T>,
  setLoading: (loading: boolean) => void,
  setError?: (error: string | null) => void
): Promise<T | null> => {
  try {
    setLoading(true);
    setError?.(null);
    const result = await operation();
    return result;
  } catch (error) {
    console.error('Operation failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Operation failed';
    setError?.(errorMessage);
    return null;
  } finally {
    setLoading(false);
  }
};

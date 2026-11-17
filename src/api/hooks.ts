import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import type {
  ApiArrayResponse,
  ApiItemResponse,
  Author,
  Book,
  BookStatus,
  BorrowedBook,
  Borrower,
  GoalPeriod,
  Loan,
  Location,
  PaginatedResponse,
  Publisher,
  ReadingGoal,
  ReadingSession,
  ReadingStats,
  ReadingStatus,
  RemindersResponse,
  Tag,
  WishlistItem,
} from './types';

/** Tek bir yerden yönetilen sorgu anahtarları — invalidation kolay olsun. */
export const keys = {
  books: ['books'] as const,
  book: (id: string) => ['books', 'detail', id] as const,
  reference: (name: string) => ['reference', name] as const,
  sessions: ['sessions'] as const,
  loans: ['loans'] as const,
  goals: ['goals'] as const,
  stats: (year?: number) => ['stats', year ?? 'current'] as const,
  overview: ['overview'] as const,
  reminders: ['reminders'] as const,
  wishlist: ['wishlist'] as const,
  borrowed: ['borrowed'] as const,
};

/** Bir kitabı etkileyen her değişiklikten sonra tazelenmesi gereken her şey. */
function useInvalidateLibrary() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.books }),
      qc.invalidateQueries({ queryKey: keys.sessions }),
      qc.invalidateQueries({ queryKey: keys.loans }),
      qc.invalidateQueries({ queryKey: keys.goals }),
      qc.invalidateQueries({ queryKey: ['stats'] }),
      qc.invalidateQueries({ queryKey: keys.overview }),
      qc.invalidateQueries({ queryKey: keys.reminders }),
    ]);
}

// ---------------------------------------------------------------- Kitaplar

export type BookFilters = {
  search?: string;
  status?: BookStatus | '';
  location_id?: string;
  tag_id?: string;
  author_id?: string;
  publisher_id?: string;
};

const PAGE_SIZE = 30;

export function useBooks(filters: BookFilters) {
  return useInfiniteQuery({
    queryKey: [...keys.books, 'list', filters],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ per_page: String(PAGE_SIZE), page: String(pageParam) });
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, String(v).trim()));
      return api.get<PaginatedResponse<Book>>(`/books?${params}`, signal);
    },
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  });
}

/** Ana sayfa için: sadece toplam sayı + son eklenenler (tek küçük istek). */
export function useRecentBooks() {
  return useQuery({
    queryKey: [...keys.books, 'recent'],
    queryFn: () => api.get<PaginatedResponse<Book>>('/books?per_page=10&page=1'),
  });
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: keys.book(id ?? ''),
    enabled: !!id,
    queryFn: () => api.get<ApiItemResponse<Book>>(`/books/${id}`).then((r) => r.data),
  });
}

export type BookPayload = {
  title: string;
  subtitle?: string | null;
  status?: BookStatus;
  translator?: string | null;
  edition?: string | null;
  page_count?: number | null;
  published_at?: string | null;
  isbn10?: string | null;
  isbn13?: string | null;
  description?: string | null;
  publisher_id?: string | null;
  location_id?: string | null;
  author_ids?: string[];
  tag_ids?: string[];
};

export function useSaveBook() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<BookPayload> }) =>
      (id
        ? api.put<ApiItemResponse<Book>>(`/books/${id}`, payload)
        : api.post<ApiItemResponse<Book>>('/books', payload)
      ).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteBook() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/books/${id}`),
    onSuccess: invalidate,
  });
}

export function useScanIsbn() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (isbn: string) => api.post<ApiItemResponse<Book>>('/books/scan-isbn', { isbn }).then((r) => r.data),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------ Referans verileri

function useReference<T>(name: string) {
  return useQuery({
    queryKey: keys.reference(name),
    staleTime: 5 * 60_000,
    // Sayfalı ve sayfasız uç noktaların ikisi de { data: [...] } döner.
    queryFn: () => api.get<ApiArrayResponse<T>>(`/${name}?per_page=1000`).then((r) => r.data),
  });
}

export const useAuthors = () => useReference<Author>('authors');
export const usePublishers = () => useReference<Publisher>('publishers');
export const useLocations = () => useReference<Location>('locations');
export const useTags = () => useReference<Tag>('tags');
export const useBorrowers = () => useReference<Borrower>('borrowers');

export function useCreateReference<T>(name: 'authors' | 'publishers' | 'locations' | 'tags' | 'borrowers') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<ApiItemResponse<T>>(`/${name}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.reference(name) }),
  });
}

export function useUpdateReference(name: 'authors' | 'publishers' | 'locations' | 'tags' | 'borrowers') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.put(`/${name}/${id}`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.reference(name) });
      void qc.invalidateQueries({ queryKey: keys.books });
    },
  });
}

export function useDeleteReference(name: 'authors' | 'publishers' | 'locations' | 'tags' | 'borrowers') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/${name}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.reference(name) }),
  });
}

// ---------------------------------------------------------- Okuma kayıtları

export function useSessions(params: { book_id?: string; status?: ReadingStatus }) {
  return useQuery({
    queryKey: [...keys.sessions, params],
    queryFn: () => {
      const q = new URLSearchParams({ per_page: '100' });
      if (params.book_id) q.set('book_id', params.book_id);
      if (params.status) q.set('status', params.status);
      return api.get<PaginatedResponse<ReadingSession>>(`/reading-sessions?${q}`).then((r) => r.data);
    },
  });
}

export type SessionPayload = {
  status: ReadingStatus;
  started_at?: string | null;
  finished_at?: string | null;
  rating?: number | null;
  notes?: string | null;
};

export function useSaveSession() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, bookId, payload }: { id?: string; bookId: string; payload: SessionPayload }) =>
      id ? api.put(`/reading-sessions/${id}`, payload) : api.post('/reading-sessions', { book_id: bookId, ...payload }),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------------ Emanet

export function useLoans() {
  return useQuery({
    queryKey: keys.loans,
    queryFn: () => api.get<PaginatedResponse<Loan>>('/loans?per_page=200').then((r) => r.data),
  });
}

export function useLendBook() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (payload: { book_id: string; borrower_id: string; due_at?: string | null }) => api.post('/loans', payload),
    onSuccess: invalidate,
  });
}

export function useReturnLoan() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (loanId: string) => api.patch(`/loans/${loanId}/return`),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------- Hedefler / istatistik

export function useGoals() {
  return useQuery({
    queryKey: keys.goals,
    queryFn: () => api.get<ApiArrayResponse<ReadingGoal>>('/reading-goals').then((r) => r.data),
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { period_type: GoalPeriod; target_books: number }) => api.post('/reading-goals', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.goals }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/reading-goals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.goals }),
  });
}

export function useStats(year?: number) {
  return useQuery({
    queryKey: keys.stats(year),
    queryFn: () => api.get<ReadingStats>(`/reading-stats${year ? `?year=${year}` : ''}`),
  });
}

export type LibraryOverview = {
  total_books: number;
  read_books: number;
  unread_books: number;
  total_pages: number;
  read_pages: number;
  unread_pages: number;
  publisher_distribution: { name: string; count: number }[];
  author_distribution: { name: string; count: number }[];
};

export function useOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<ApiItemResponse<LibraryOverview>>('/library-overview').then((r) => r.data),
  });
}

export function useReminders() {
  return useQuery({
    queryKey: keys.reminders,
    queryFn: () => api.get<RemindersResponse>('/reminders'),
  });
}

// --------------------------------------------------------------- Alınacaklar

export function useWishlist() {
  return useQuery({
    queryKey: keys.wishlist,
    queryFn: () => api.get<ApiArrayResponse<WishlistItem>>('/wishlist').then((r) => r.data),
  });
}

export function useSaveWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<WishlistItem> }) =>
      id ? api.put(`/wishlist/${id}`, payload) : api.post('/wishlist', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.wishlist }),
  });
}

export function useDeleteWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/wishlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.wishlist }),
  });
}

export function useConvertWishlistItem() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiItemResponse<Book>>(`/wishlist/${id}/convert`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wishlist });
      void invalidate();
    },
  });
}

// ------------------------------------------------------ Ödünç aldıklarım

export function useBorrowedBooks() {
  return useQuery({
    queryKey: keys.borrowed,
    queryFn: () => api.get<ApiArrayResponse<BorrowedBook>>('/borrowed-books').then((r) => r.data),
  });
}

export function useSaveBorrowedBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id ? api.put(`/borrowed-books/${id}`, payload) : api.post('/borrowed-books', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.borrowed });
      void qc.invalidateQueries({ queryKey: keys.reminders });
    },
  });
}

export function useReturnBorrowedBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/borrowed-books/${id}/return`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.borrowed });
      void qc.invalidateQueries({ queryKey: keys.reminders });
    },
  });
}

export function useDeleteBorrowedBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/borrowed-books/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.borrowed }),
  });
}

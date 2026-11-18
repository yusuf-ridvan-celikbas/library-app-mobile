import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as booksRepo from '@/db/repo/books';
import * as circulation from '@/db/repo/circulation';
import * as reading from '@/db/repo/reading';
import * as reference from '@/db/repo/reference';
import { lookupAndCreateBook } from '@/lib/isbn';
import { updateReadingWidget } from '@/widgets/updateReadingWidget';

import type {
  Author,
  Book,
  BookStatus,
  BorrowedBook,
  Borrower,
  GoalPeriod,
  Location,
  Publisher,
  ReadingStatus,
  Tag,
  WishlistItem,
} from './types';

/*
 * Tüm veri artık telefondaki SQLite veritabanında (src/db). Bu dosya
 * ekranların kullandığı react-query kancalarını sağlar — kanca adları ve
 * döndürdükleri şekiller sunuculu sürümle AYNI, böylece ekranlar
 * değişmeden çalışır. Önbellek "staleTime: Infinity": veri sadece bu
 * uygulama içinden değişir, değiştiğinde ilgili sorgular geçersiz kılınır.
 */

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
export function useInvalidateLibrary() {
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
      updateReadingWidget(),
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
    queryFn: ({ pageParam }) => booksRepo.listBooks(filters, pageParam, PAGE_SIZE),
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  });
}

/** Ana sayfa için: son eklenenler (ve toplam sayı). */
export function useRecentBooks() {
  return useQuery({
    queryKey: [...keys.books, 'recent'],
    queryFn: () => booksRepo.listBooks({}, 1, 10),
  });
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: keys.book(id ?? ''),
    enabled: !!id,
    queryFn: () => booksRepo.getBook(id!),
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
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<BookPayload> }): Promise<Book> => booksRepo.saveBook(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteBook() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => booksRepo.deleteBook(id),
    onSuccess: invalidate,
  });
}

export function useScanIsbn() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (isbn: string) => lookupAndCreateBook(isbn),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------ Referans verileri

type RefName = reference.ReferenceName;

function useReference<T>(name: RefName) {
  return useQuery({
    queryKey: keys.reference(name),
    queryFn: () => reference.listReference(name) as Promise<T[]>,
  });
}

export const useAuthors = () => useReference<Author>('authors');
export const usePublishers = () => useReference<Publisher>('publishers');
export const useLocations = () => useReference<Location>('locations');
export const useTags = () => useReference<Tag>('tags');
export const useBorrowers = () => useReference<Borrower>('borrowers');

export function useCreateReference<T extends { id: string }>(name: RefName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => reference.saveReference(name, undefined, payload) as Promise<Pick<T, 'id'>>,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.reference(name) }),
  });
}

export function useUpdateReference(name: RefName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => reference.saveReference(name, id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.reference(name) });
      void qc.invalidateQueries({ queryKey: keys.books });
    },
  });
}

export function useDeleteReference(name: RefName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reference.deleteReference(name, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.reference(name) });
      void qc.invalidateQueries({ queryKey: keys.books });
    },
  });
}

// ---------------------------------------------------------- Okuma kayıtları

export function useSessions(params: { book_id?: string; status?: ReadingStatus }) {
  return useQuery({
    queryKey: [...keys.sessions, params],
    queryFn: () => reading.listSessions(params),
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
    mutationFn: ({ id, bookId, payload }: { id?: string; bookId: string; payload: SessionPayload }) => reading.saveSession(id, bookId, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteSession() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => reading.deleteSession(id),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------------ Emanet

export function useLoans() {
  return useQuery({ queryKey: keys.loans, queryFn: circulation.listLoans });
}

export function useLendBook() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (payload: { book_id: string; borrower_id: string; due_at?: string | null }) => circulation.lendBook(payload),
    onSuccess: invalidate,
  });
}

export function useReturnLoan() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (loanId: string) => circulation.returnLoan(loanId),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------- Hedefler / istatistik

export function useGoals() {
  return useQuery({ queryKey: keys.goals, queryFn: reading.listGoals });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { period_type: GoalPeriod; target_books: number }) => reading.createGoal(payload.period_type, payload.target_books),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.goals }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reading.deleteGoal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.goals }),
  });
}

export function useStats(year?: number) {
  return useQuery({ queryKey: keys.stats(year), queryFn: () => reading.computeStats(year) });
}

export type LibraryOverview = Awaited<ReturnType<typeof reading.computeOverview>>;

export function useOverview() {
  return useQuery({ queryKey: keys.overview, queryFn: reading.computeOverview });
}

export function useReminders() {
  return useQuery({ queryKey: keys.reminders, queryFn: circulation.computeReminders });
}

// --------------------------------------------------------------- Alınacaklar

export function useWishlist() {
  return useQuery({ queryKey: keys.wishlist, queryFn: circulation.listWishlist });
}

export function useSaveWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<WishlistItem> }) => circulation.saveWishlistItem(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.wishlist }),
  });
}

export function useDeleteWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => circulation.deleteWishlistItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.wishlist }),
  });
}

export function useConvertWishlistItem() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => circulation.convertWishlistItem(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wishlist });
      void invalidate();
    },
  });
}

// ------------------------------------------------------ Ödünç aldıklarım

export function useBorrowedBooks() {
  return useQuery<BorrowedBook[]>({ queryKey: keys.borrowed, queryFn: circulation.listBorrowed });
}

function useInvalidateBorrowed() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.borrowed });
    void qc.invalidateQueries({ queryKey: keys.reminders });
    void qc.invalidateQueries({ queryKey: ['stats'] });
    void qc.invalidateQueries({ queryKey: keys.goals });
    void updateReadingWidget();
  };
}

export function useSaveBorrowedBook() {
  const invalidate = useInvalidateBorrowed();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) => circulation.saveBorrowed(id, payload),
    onSuccess: invalidate,
  });
}

export function useReturnBorrowedBook() {
  const invalidate = useInvalidateBorrowed();
  return useMutation({
    mutationFn: (id: string) => circulation.returnBorrowed(id),
    onSuccess: invalidate,
  });
}

export function useConvertToBorrowed() {
  const invalidate = useInvalidateLibrary();
  const invalidateBorrowed = useInvalidateBorrowed();
  return useMutation({
    mutationFn: (p: { bookId: string; borrowerId: string; dueAt: string | null }) => circulation.convertBookToBorrowed(p.bookId, p.borrowerId, p.dueAt),
    onSuccess: () => {
      void invalidate();
      invalidateBorrowed();
    },
  });
}

export function useDeleteBorrowedBook() {
  const invalidate = useInvalidateBorrowed();
  return useMutation({
    mutationFn: (id: string) => circulation.deleteBorrowed(id),
    onSuccess: invalidate,
  });
}

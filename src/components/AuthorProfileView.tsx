import React from 'react';
import { ArrowLeft, BookOpen, Check, Star, UserPlus } from 'lucide-react';
import { AuthorFollow, BookCampaign } from '../types';
import { BookCard } from './BookCard';

interface AuthorProfileViewProps {
  authorId: string;
  fallbackPenName?: string;
  books: BookCampaign[];
  follows: AuthorFollow[];
  currentUserId: string | null;
  followBusy: boolean;
  onToggleFollow: (authorId: string, authorPenName: string) => void;
  onSelectBook: (book: BookCampaign) => void;
  onBack: () => void;
}

export const AuthorProfileView: React.FC<AuthorProfileViewProps> = ({
  authorId,
  fallbackPenName,
  books,
  follows,
  currentUserId,
  followBusy,
  onToggleFollow,
  onSelectBook,
  onBack,
}) => {
  const authorBooks = books.filter((b) => b.authorId === authorId);
  const leadBook = authorBooks[0];
  const penName = leadBook?.authorPenName || fallbackPenName || 'Debut Author';
  const bio =
    leadBook?.authorBio ||
    'Independent writer sharing opening chapters and seeking reader patronage on FirstFolio.';

  const totalRatingsCount = authorBooks.reduce((acc, b) => acc + b.ratingCount, 0);
  const totalRatingSum = authorBooks.reduce((acc, b) => acc + b.ratingSum, 0);
  const communityRating =
    totalRatingsCount > 0 ? (totalRatingSum / totalRatingsCount).toFixed(1) : 'New';
  const totalRaisedUsd = authorBooks.reduce((acc, b) => acc + b.raisedUsd, 0);
  const totalBackers = authorBooks.reduce((acc, b) => acc + b.donorCount, 0);
  const genres = Array.from(new Set(authorBooks.map((b) => b.genre)));

  const authorFollows = follows.filter((f) => f.authorId === authorId);
  const followerCount = authorFollows.length;
  const isFollowing = Boolean(
    currentUserId && authorFollows.some((f) => f.followerId === currentUserId)
  );
  const isOwnProfile = Boolean(currentUserId && currentUserId === authorId);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 md:py-12 space-y-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Manuscript Catalog
      </button>

      {/* Author Identity & Follow Banner */}
      <header className="bg-white border border-[#E6E3DC] rounded-xl p-6 md:p-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
              Public Author Portfolio{genres.length > 0 ? ` · ${genres.join(' / ')}` : ''}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-zinc-900 leading-tight">
              {penName}
            </h1>
            <p className="text-sm md:text-base text-zinc-600 leading-relaxed">{bio}</p>
          </div>

          <div className="shrink-0 flex flex-col items-start md:items-end gap-2">
            {isOwnProfile ? (
              <span className="min-h-[42px] px-4 py-2 rounded-lg border border-[#D8D3C8] bg-[#FAF9F6] text-xs font-medium text-zinc-700 inline-flex items-center">
                Your Public Author Page
              </span>
            ) : (
              <button
                type="button"
                disabled={followBusy}
                onClick={() => onToggleFollow(authorId, penName)}
                className={`min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                  isFollowing
                    ? 'border border-[#1E3A8A] bg-[#EFF3FF] text-[#1E3A8A] hover:bg-[#E0E7FF]'
                    : 'bg-[#1E3A8A] text-white hover:bg-[#1E40AF]'
                }`}
              >
                {isFollowing ? (
                  <>
                    <Check className="w-4 h-4" />
                    Following Author
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Follow Author
                  </>
                )}
              </button>
            )}
            <p className="text-xs font-mono text-zinc-500 tabular-nums">
              {followerCount} {followerCount === 1 ? 'reader follower' : 'reader followers'}
            </p>
          </div>
        </div>

        {/* Author Community Metrics */}
        <div className="pt-6 border-t border-[#E6E3DC] grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-zinc-500">Community Rating</p>
            <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1 inline-flex items-center gap-1.5">
              <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
              {communityRating}
              {totalRatingsCount > 0 && (
                <span className="text-xs font-normal text-zinc-500">
                  ({totalRatingsCount})
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Published Manuscripts</p>
            <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1">
              {authorBooks.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Patron Support Raised</p>
            <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1">
              ${totalRaisedUsd.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Reader Backers</p>
            <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1">
              {totalBackers}
            </p>
          </div>
        </div>
      </header>

      {/* Author's Manuscripts */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#1E3A8A]" />
          <h2 className="font-display text-2xl font-semibold text-zinc-900">
            Manuscripts by {penName} ({authorBooks.length})
          </h2>
        </div>

        {authorBooks.length === 0 ? (
          <div className="bg-white border border-[#E6E3DC] rounded-xl p-10 text-center text-sm text-zinc-500">
            This author has no public manuscripts listed yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {authorBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onSelect={onSelectBook}
                onSelectAuthor={() => {}}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

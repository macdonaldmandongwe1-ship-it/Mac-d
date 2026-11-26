import React from 'react';
import { Star } from 'lucide-react';
import { BookCampaign } from '../types';
import { CoverImage } from './CoverImage';

interface BookCardProps {
  book: BookCampaign;
  onSelect: (book: BookCampaign) => void;
  onSelectAuthor: (authorId: string, authorPenName: string) => void;
}

const STATUS_LABELS: Record<BookCampaign['status'], string> = {
  seeking_funding: 'Seeking Funding',
  funded: 'Goal Reached',
  published: 'Published',
};

export const BookCard: React.FC<BookCardProps> = ({ book, onSelect, onSelectAuthor }) => {
  const pct = book.goalUsd > 0 ? Math.min(100, Math.round((book.raisedUsd / book.goalUsd) * 100)) : 0;

  return (
    <article className="group bg-white border border-[#E6E3DC] rounded-xl overflow-hidden flex flex-col transition-transform duration-150 hover:-translate-y-0.5">
      {/* Book Cover Art (3:4 editorial ratio) */}
      <button
        type="button"
        onClick={() => onSelect(book)}
        aria-label={`Read excerpt and support ${book.title}`}
        className="relative aspect-[3/4] w-full overflow-hidden bg-[#F1EFE9] border-b border-[#E6E3DC] cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A]"
      >
        <CoverImage
          src={book.coverImageUrl}
          alt={`Cover art for ${book.title} by ${book.authorPenName}`}
          title={book.title}
          authorPenName={book.authorPenName}
          tone={book.coverTone}
          className="w-full h-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </button>

      {/* Editorial Body */}
      <div className="p-6 flex flex-col flex-1 justify-between gap-5">
        <div className="space-y-2.5">
          {/* Clean unboxed metadata line */}
          <p className="text-xs text-zinc-500 flex items-center gap-1.5 truncate">
            <span>{book.genre}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{book.pageCount} pages</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                book.status === 'funded' || book.status === 'published'
                  ? 'text-[#1E3A8A] font-medium'
                  : ''
              }
            >
              {STATUS_LABELS[book.status]}
            </span>
          </p>

          <div>
            <button
              type="button"
              onClick={() => onSelect(book)}
              className="text-left font-display text-xl font-semibold text-zinc-900 leading-snug hover:text-[#1E3A8A] transition-colors cursor-pointer"
            >
              {book.title}
            </button>
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => onSelectAuthor(book.authorId, book.authorPenName)}
                className="text-sm text-zinc-600 hover:text-[#1E3A8A] hover:underline underline-offset-4 transition-colors cursor-pointer"
              >
                by {book.authorPenName}
              </button>
            </div>
          </div>

          <p className="text-sm text-zinc-600 leading-relaxed line-clamp-2">{book.pitch}</p>
        </div>

        {/* Funding & Rating Footer */}
        <button
          type="button"
          onClick={() => onSelect(book)}
          className="pt-4 border-t border-[#E6E3DC] space-y-3 text-left w-full cursor-pointer"
        >
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                ${book.raisedUsd.toLocaleString()}
              </span>
              <span className="text-xs text-zinc-500 font-mono tabular-nums">
                of ${book.goalUsd.toLocaleString()} goal ({pct}%)
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#EFECE5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1E3A8A] rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1 font-medium text-zinc-800">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span className="font-mono tabular-nums">
                {book.ratingCount > 0 ? book.averageRating.toFixed(1) : 'New'}
              </span>
              <span className="text-zinc-500 font-normal tabular-nums">
                {book.ratingCount > 0 ? `(${book.ratingCount} ratings)` : '· Awaiting reviews'}
              </span>
            </span>
            <span className="text-zinc-500 font-mono tabular-nums">
              {book.donorCount} {book.donorCount === 1 ? 'backer' : 'backers'}
            </span>
          </div>
        </button>
      </div>
    </article>
  );
};

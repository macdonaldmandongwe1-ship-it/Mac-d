import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  ADMIN_EMAIL,
  AuthorFollow,
  AuthorSubscription,
  AuthorSubscriptionPayment,
  BOOK_GENRES,
  BookCampaign,
  BookDonation,
  BookGenre,
  BookRating,
  FIELD_LIMITS,
  UserProfile,
  UserRole,
} from './types';
import {
  HERO_EDITORIAL_IMAGE,
  SHOWCASE_BOOK_SEEDS,
  buildPreviewBooks,
} from './data/showcaseBooks';
import { ActiveSection, TopBar } from './components/TopBar';
import { BookCard } from './components/BookCard';
import { BookDetailView } from './components/BookDetailView';
import { AuthorStudio } from './components/AuthorStudio';
import { AuthorProfileView } from './components/AuthorProfileView';
import { EmailToastStack } from './components/EmailToastStack';
import { SignInPage } from './components/SignInPage';
import {
  AuthorEmailInput,
  AuthorEmailStatus,
  SimulatedEmailNotification,
  registerAuthorEmailWithServer,
  sendAuthorEmailNotification,
  sendTestAuthorEmail,
  simulateAuthorEmailNotification,
} from './utils/emailNotifications';
import { fetchStripeConfig, StripeConfigResponse } from './utils/stripeClient';

type SortMode = 'top_rated' | 'most_funded' | 'newest' | 'closest_to_goal';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [liveBooks, setLiveBooks] = useState<BookCampaign[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [myBooks, setMyBooks] = useState<BookCampaign[]>([]);
  const [subscription, setSubscription] = useState<AuthorSubscription | null>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<AuthorSubscriptionPayment[]>([]);
  const [authorFollows, setAuthorFollows] = useState<AuthorFollow[]>([]);
  const [followBusy, setFollowBusy] = useState(false);

  const [activeView, setActiveView] = useState<'home' | 'studio' | 'detail' | 'signin' | 'author'>('home');
  const [preferredSignInRole, setPreferredSignInRole] = useState<UserRole>('reader');
  const [returnViewAfterSignIn, setReturnViewAfterSignIn] = useState<'home' | 'studio' | 'detail' | 'author'>('home');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [selectedAuthorName, setSelectedAuthorName] = useState<string>('');

  const [selectedGenre, setSelectedGenre] = useState<'All' | BookGenre>('All');
  const [sortMode, setSortMode] = useState<SortMode>('top_rated');
  const [searchQuery, setSearchQuery] = useState('');
  const [emailToasts, setEmailToasts] = useState<SimulatedEmailNotification[]>([]);
  const [emailStatus, setEmailStatus] = useState<AuthorEmailStatus | null>(null);
  const [stripeConfig, setStripeConfig] = useState<StripeConfigResponse>({
    configured: false,
    publishableKey: null,
  });

  const seededRef = useRef(false);
  const pendingRoleRef = useRef<UserRole | null>(null);
  const seenEmailEventsRef = useRef<Set<string>>(new Set());
  const previewBooks = useMemo(() => buildPreviewBooks(), []);

  const triggerAuthorEmailToast = (input: AuthorEmailInput, fromLocalAction = false) => {
    if (seenEmailEventsRef.current.has(input.eventKey)) return;
    seenEmailEventsRef.current.add(input.eventKey);

    if (fromLocalAction && currentUser && currentUser.emailVerified) {
      void sendAuthorEmailNotification(currentUser, input).then((toast) => {
        setEmailToasts((prev) => [toast, ...prev].slice(0, 4));
      });
      return;
    }

    const toast = simulateAuthorEmailNotification(
      input,
      emailStatus?.emailConfigured ? 'sent' : 'local_preview',
      emailStatus?.emailConfigured
        ? 'Inbox notification active via Resend'
        : 'Local preview notification'
    );
    setEmailToasts((prev) => [toast, ...prev].slice(0, 4));
  };

  const handleDismissToast = (id: string) => {
    setEmailToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    void fetchStripeConfig().then(setStripeConfig);
  }, []);

  // Auth listener & private user profile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);

      if (user && user.emailVerified) {
        void registerAuthorEmailWithServer(user).then(setEmailStatus);
        const userRef = doc(db, 'users', user.uid);
        const chosenRole: UserRole = pendingRoleRef.current || 'author';
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: user.uid,
              displayName: (user.displayName || 'Author').slice(0, FIELD_LIMITS.displayNameMax),
              email: user.email || '',
              role: chosenRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (pendingRoleRef.current && snap.data().role !== pendingRoleRef.current) {
            await updateDoc(userRef, {
              role: pendingRoleRef.current,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        } finally {
          pendingRoleRef.current = null;
        }
      } else {
        setUserProfile(null);
        setEmailStatus(null);
      }
    });
    return () => unsub();
  }, []);

  // Public catalog & author follows listeners
  useEffect(() => {
    const publicBooksQuery = query(
      collection(db, 'books'),
      where('visibility', '==', 'public')
    );

    const unsubBooks = onSnapshot(
      publicBooksQuery,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as BookCampaign);
        setLiveBooks(rows);
        setCatalogLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'books?visibility=public');
      }
    );

    const publicFollowsQuery = query(
      collection(db, 'authorFollows'),
      where('visibility', '==', 'public')
    );

    const unsubFollows = onSnapshot(
      publicFollowsQuery,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as AuthorFollow);
        setAuthorFollows(rows);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'authorFollows?visibility=public');
      }
    );

    return () => {
      unsubBooks();
      unsubFollows();
    };
  }, []);

  // Admin one-time showcase bootstrap into Firestore when catalog is empty
  useEffect(() => {
    if (
      !authReady ||
      !catalogLoaded ||
      seededRef.current ||
      liveBooks.length > 0 ||
      !currentUser ||
      !currentUser.emailVerified ||
      currentUser.email !== ADMIN_EMAIL
    ) {
      return;
    }

    seededRef.current = true;
    const batch = writeBatch(db);
    for (const seed of SHOWCASE_BOOK_SEEDS) {
      batch.set(doc(db, 'books', seed.id), {
        ...seed,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    batch.commit().catch((err) => {
      seededRef.current = false;
      handleFirestoreError(err, OperationType.WRITE, 'books/showcase_seed');
    });
  }, [authReady, catalogLoaded, liveBooks.length, currentUser]);

  // Authenticated author subscriptions, receipts, & authored books
  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified) {
      setUserProfile(null);
      setSubscription(null);
      setSubscriptionPayments([]);
      setMyBooks([]);
      return;
    }

    const unsubUserProfile = onSnapshot(
      doc(db, 'users', currentUser.uid),
      (snap) => {
        setUserProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
      }
    );

    const unsubSub = onSnapshot(
      doc(db, 'authorSubscriptions', currentUser.uid),
      (snap) => {
        setSubscription(snap.exists() ? (snap.data() as AuthorSubscription) : null);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `authorSubscriptions/${currentUser.uid}`);
      }
    );

    const payQuery = query(
      collection(db, 'authorSubscriptionPayments'),
      where('authorId', '==', currentUser.uid)
    );
    const unsubPay = onSnapshot(
      payQuery,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as AuthorSubscriptionPayment);
        rows.sort((a, b) => (b.paidAt?.toMillis?.() || 0) - (a.paidAt?.toMillis?.() || 0));
        setSubscriptionPayments(rows);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'authorSubscriptionPayments');
      }
    );

    const myBooksQuery = query(
      collection(db, 'books'),
      where('authorId', '==', currentUser.uid)
    );
    const unsubMyBooks = onSnapshot(
      myBooksQuery,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as BookCampaign);
        rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyBooks(rows);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `books?authorId=${currentUser.uid}`);
      }
    );

    let initialDonationsDone = false;
    const authorDonationsQuery = query(
      collection(db, 'donations'),
      where('authorId', '==', currentUser.uid)
    );
    const unsubAuthorDonations = onSnapshot(
      authorDonationsQuery,
      (snap) => {
        if (!initialDonationsDone) {
          snap.docs.forEach((d) => seenEmailEventsRef.current.add(`donation_${d.id}`));
          initialDonationsDone = true;
          return;
        }
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const d = change.doc.data() as BookDonation;
            triggerAuthorEmailToast({
              kind: 'donation',
              eventKey: `donation_${d.id}`,
              authorId: d.authorId,
              authorPenName: currentUser.displayName || 'Author',
              recipientLabel: currentUser.email || currentUser.displayName || 'Author',
              bookTitle: d.bookTitle,
              donorName: d.donorName,
              amountUsd: d.amountUsd,
              message: d.message,
            });
          }
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `donations?authorId=${currentUser.uid}`);
      }
    );

    let initialRatingsDone = false;
    const authorRatingsQuery = query(
      collection(db, 'ratings'),
      where('authorId', '==', currentUser.uid)
    );
    const unsubAuthorRatings = onSnapshot(
      authorRatingsQuery,
      (snap) => {
        if (!initialRatingsDone) {
          snap.docs.forEach((r) => seenEmailEventsRef.current.add(`rating_${r.id}`));
          initialRatingsDone = true;
          return;
        }
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const r = change.doc.data() as BookRating;
            triggerAuthorEmailToast({
              kind: 'rating',
              eventKey: `rating_${r.id}`,
              authorId: r.authorId,
              authorPenName: currentUser.displayName || 'Author',
              recipientLabel: currentUser.email || currentUser.displayName || 'Author',
              bookTitle: r.bookTitle,
              reviewerName: r.reviewerName,
              stars: r.stars,
              craftFocus: r.craftFocus,
              reviewText: r.reviewText,
            });
          }
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `ratings?authorId=${currentUser.uid}`);
      }
    );

    return () => {
      unsubUserProfile();
      unsubSub();
      unsubPay();
      unsubMyBooks();
      unsubAuthorDonations();
      unsubAuthorRatings();
    };
  }, [authReady, currentUser]);

  const openSignInPage = (
    role: UserRole = 'reader',
    returnTo: 'home' | 'studio' | 'detail' | 'author' = 'home'
  ) => {
    setAuthError(null);
    setPreferredSignInRole(role);
    setReturnViewAfterSignIn(returnTo);
    setActiveView('signin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenAuthorPage = (authorId: string, authorPenName: string) => {
    setSelectedAuthorId(authorId);
    setSelectedAuthorName(authorPenName);
    setSelectedBookId(null);
    setActiveView('author');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleFollowAuthor = async (authorId: string, authorPenName: string) => {
    if (!currentUser || !currentUser.emailVerified) {
      openSignInPage('reader', activeView === 'detail' ? 'detail' : 'author');
      return;
    }
    if (currentUser.uid === authorId) return;

    const followId = `${authorId}_${currentUser.uid}`;
    const alreadyFollowing = authorFollows.some((f) => f.id === followId);
    setFollowBusy(true);
    try {
      if (alreadyFollowing) {
        await deleteDoc(doc(db, 'authorFollows', followId));
      } else {
        await setDoc(doc(db, 'authorFollows', followId), {
          id: followId,
          authorId,
          authorPenName: authorPenName.slice(0, FIELD_LIMITS.penNameMax),
          followerId: currentUser.uid,
          followerName: (currentUser.displayName || 'Reader').slice(0, FIELD_LIMITS.displayNameMax),
          visibility: 'public',
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `authorFollows/${followId}`);
    } finally {
      setFollowBusy(false);
    }
  };

  const handleSignInWithRole = async (role: UserRole) => {
    setAuthError(null);
    setAuthBusy(true);
    pendingRoleRef.current = role;
    try {
      await signInWithPopup(auth, googleProvider);
      if (returnViewAfterSignIn === 'detail' && selectedBookId) {
        setActiveView('detail');
      } else if (returnViewAfterSignIn === 'author' && selectedAuthorId) {
        setActiveView('author');
      } else if (role === 'author') {
        setActiveView('studio');
      } else {
        setActiveView('home');
      }
    } catch (err) {
      pendingRoleRef.current = null;
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSwitchRole = async (role: UserRole) => {
    if (!currentUser || !currentUser.emailVerified) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        role,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOut(auth);
      if (activeView === 'studio') {
        setActiveView('home');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAuthAction = async () => {
    if (currentUser) {
      await handleSignOut();
    } else {
      openSignInPage(
        activeView === 'studio' ? 'author' : 'reader',
        activeView === 'detail' ? 'detail' : activeView === 'author' ? 'author' : 'home'
      );
    }
  };

  const handleNavigate = (target: ActiveSection) => {
    if (target === 'submit' || target === 'studio') {
      setSelectedBookId(null);
      setActiveView('studio');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSelectedBookId(null);
    setActiveView('home');
    setTimeout(() => {
      const el = document.getElementById(target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 40);
  };

  const isLiveCatalog = liveBooks.length > 0;
  const displayBooks = isLiveCatalog ? liveBooks : previewBooks;

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = displayBooks.filter((b) => {
      if (selectedGenre !== 'All' && b.genre !== selectedGenre) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.authorPenName.toLowerCase().includes(q) ||
        b.pitch.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortMode === 'top_rated') {
        if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
        return b.ratingCount - a.ratingCount;
      }
      if (sortMode === 'most_funded') {
        return b.raisedUsd - a.raisedUsd;
      }
      if (sortMode === 'closest_to_goal') {
        const pctA = a.goalUsd > 0 ? a.raisedUsd / a.goalUsd : 0;
        const pctB = b.goalUsd > 0 ? b.raisedUsd / b.goalUsd : 0;
        return pctB - pctA;
      }
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    });
    return list;
  }, [displayBooks, selectedGenre, searchQuery, sortMode]);

  const selectedBook = useMemo(() => {
    if (!selectedBookId) return null;
    return (
      liveBooks.find((b) => b.id === selectedBookId) ||
      myBooks.find((b) => b.id === selectedBookId) ||
      previewBooks.find((b) => b.id === selectedBookId) ||
      null
    );
  }, [selectedBookId, liveBooks, myBooks, previewBooks]);

  useEffect(() => {
    const currentUrl = window.location.origin + window.location.pathname;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', currentUrl);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', currentUrl);

    if (activeView === 'detail' && selectedBook) {
      document.title = `${selectedBook.title} by ${selectedBook.authorPenName} – FirstFolio`;
    } else if (activeView === 'author' && selectedAuthorId) {
      document.title = `${selectedAuthorName || 'Author'} – FirstFolio`;
    } else if (activeView === 'studio') {
      document.title = 'Author Studio – FirstFolio';
    } else if (activeView === 'signin') {
      document.title = 'Sign In (Authors & Readers) – FirstFolio';
    } else {
      document.title = 'FirstFolio – Debut Book Publishing, Donations & Ratings';
    }

    const existingBookLd = document.getElementById('book-json-ld');
    if (existingBookLd) existingBookLd.remove();

    if (activeView === 'detail' && selectedBook) {
      const script = document.createElement('script');
      script.id = 'book-json-ld';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: selectedBook.title,
        author: {
          '@type': 'Person',
          name: selectedBook.authorPenName,
        },
        genre: selectedBook.genre,
        numberOfPages: selectedBook.pageCount,
        description: selectedBook.pitch,
        ...(selectedBook.ratingCount > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: selectedBook.averageRating,
                ratingCount: selectedBook.ratingCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      });
      document.head.appendChild(script);
    }
  }, [activeView, selectedBook]);

  const totalFundingUsd = useMemo(
    () => displayBooks.reduce((acc, b) => acc + b.raisedUsd, 0),
    [displayBooks]
  );

  const avgPlatformRating = useMemo(() => {
    const totalCount = displayBooks.reduce((acc, b) => acc + b.ratingCount, 0);
    const totalSum = displayBooks.reduce((acc, b) => acc + b.ratingSum, 0);
    return totalCount > 0 ? (totalSum / totalCount).toFixed(1) : '5.0';
  }, [displayBooks]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-zinc-900">
      <TopBar
        activeView={activeView}
        isSignedIn={Boolean(currentUser)}
        isAuthBusy={authBusy}
        onNavigate={handleNavigate}
        onAuthAction={handleAuthAction}
      />

      {authError && (
        <div className="max-w-7xl mx-auto px-6 pt-4 w-full">
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900 flex items-center justify-between gap-4">
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-xs font-medium underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {activeView === 'signin' ? (
          <SignInPage
            currentUser={currentUser}
            userProfile={userProfile}
            preferredRole={preferredSignInRole}
            isAuthBusy={authBusy}
            authError={authError}
            onSignInWithRole={handleSignInWithRole}
            onSwitchRole={handleSwitchRole}
            onSignOut={handleSignOut}
            onGoToCatalog={() => {
              setSelectedBookId(null);
              setActiveView('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onGoToStudio={() => {
              setSelectedBookId(null);
              setActiveView('studio');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : activeView === 'detail' && selectedBook ? (
          <BookDetailView
            book={selectedBook}
            isLiveFirestoreDoc={liveBooks.some((b) => b.id === selectedBook.id) || myBooks.some((b) => b.id === selectedBook.id)}
            currentUser={currentUser}
            stripeConfig={stripeConfig}
            followerCount={authorFollows.filter((f) => f.authorId === selectedBook.authorId).length}
            isFollowingAuthor={Boolean(
              currentUser &&
                authorFollows.some(
                  (f) => f.authorId === selectedBook.authorId && f.followerId === currentUser.uid
                )
            )}
            followBusy={followBusy}
            onToggleFollowAuthor={handleToggleFollowAuthor}
            onSelectAuthor={handleOpenAuthorPage}
            onBack={() => {
              setSelectedBookId(null);
              setActiveView('home');
            }}
            onRequestSignIn={() => openSignInPage('reader', 'detail')}
            onNotifyAuthorEmail={(input) => triggerAuthorEmailToast(input, true)}
          />
        ) : activeView === 'author' && selectedAuthorId ? (
          <AuthorProfileView
            authorId={selectedAuthorId}
            fallbackPenName={selectedAuthorName}
            books={displayBooks}
            follows={authorFollows}
            currentUserId={currentUser?.uid || null}
            followBusy={followBusy}
            onToggleFollow={handleToggleFollowAuthor}
            onSelectBook={(book) => {
              setSelectedBookId(book.id);
              setActiveView('detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onBack={() => {
              setSelectedAuthorId(null);
              setActiveView('home');
            }}
          />
        ) : activeView === 'studio' ? (
          <AuthorStudio
            currentUser={currentUser}
            subscription={subscription}
            subscriptionPayments={subscriptionPayments}
            myBooks={myBooks}
            stripeConfig={stripeConfig}
            emailStatus={emailStatus}
            onSendTestEmail={async () => {
              if (!currentUser) {
                return { delivered: false, reason: 'Please sign in first.' };
              }
              return sendTestAuthorEmail(currentUser);
            }}
            onRequestSignIn={() => openSignInPage('author', 'studio')}
            onSelectBook={(book) => {
              setSelectedBookId(book.id);
              setActiveView('detail');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onViewPublicAuthorPage={handleOpenAuthorPage}
          />
        ) : (
          <>
            {/* Section 1: Split-Screen Editorial Hero */}
            <section className="max-w-7xl mx-auto px-6 pt-10 pb-12 md:pt-14 md:pb-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center space-y-6 py-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                    Debut Author Publishing Collective
                  </p>
                  <h1 className="font-display text-[clamp(2.25rem,4vw,3.65rem)] font-bold text-zinc-900 leading-[1.08] tracking-tight text-balance">
                    Publish your first book with readers who believe in it.
                  </h1>
                  <p className="text-base text-zinc-600 leading-relaxed max-w-xl">
                    FirstFolio lets beginner authors share opening chapters, gather honest 1–5 star reader critiques, and crowdfund editing, cover design, and print runs directly from patrons.
                  </p>
                  <div className="flex flex-wrap items-center gap-5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleNavigate('studio')}
                      className="min-h-[44px] px-6 py-2.5 rounded-lg bg-[#1E3A8A] text-white text-sm font-medium hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Post Your Manuscript
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate('catalog')}
                      className="min-h-[44px] px-2 py-2.5 text-sm font-medium text-zinc-800 hover:text-[#1E3A8A] underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Browse Manuscripts
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="h-full min-h-[280px] lg:min-h-[400px] rounded-xl overflow-hidden border border-[#E6E3DC] bg-[#EDEAE2]">
                    <img
                      src={HERO_EDITORIAL_IMAGE}
                      alt="Independent writer's desk with open manuscript and linen-bound proof copies"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Full-Width 4-Column Metrics Strip */}
              <div className="mt-10 pt-8 border-t border-[#E6E3DC] grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <p className="text-xs text-zinc-500">Manuscripts in Catalog</p>
                  <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1">
                    {displayBooks.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Reader Publishing Pledges</p>
                  <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1">
                    ${totalFundingUsd.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Average Manuscript Rating</p>
                  <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1">
                    {avgPlatformRating} / 5.0
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Author Membership</p>
                  <p className="font-mono text-2xl font-semibold text-zinc-900 tabular-nums mt-1">
                    $1 / month
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2: Manuscript Catalog */}
            <section id="catalog" className="max-w-7xl mx-auto px-6 py-12 border-t border-[#E6E3DC] space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                    Open Reading Room
                  </p>
                  <h2 className="font-display text-3xl font-bold text-zinc-900 mt-1">
                    Debut Manuscripts Seeking Support
                  </h2>
                </div>

                {/* Search & Sort Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, author, genre..."
                      aria-label="Search manuscripts"
                      className="w-full sm:w-64 min-h-[40px] pl-9 pr-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    aria-label="Sort manuscripts"
                    className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[#D8D3C8] bg-white text-sm text-zinc-900 focus:outline-none focus:border-[#1E3A8A]"
                  >
                    <option value="top_rated">Top Rated</option>
                    <option value="most_funded">Most Funded</option>
                    <option value="closest_to_goal">Closest to Goal</option>
                    <option value="newest">Newest</option>
                  </select>
                </div>
              </div>

              {/* Interactive Genre Filter Bar */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#EFECE5] rounded-lg w-fit max-w-full overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSelectedGenre('All')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedGenre === 'All'
                      ? 'bg-white text-zinc-950 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  All Genres
                </button>
                {BOOK_GENRES.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setSelectedGenre(genre)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedGenre === genre
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>

              {/* 3-Column Book Grid */}
              {filteredBooks.length === 0 ? (
                <div className="bg-white border border-[#E6E3DC] rounded-xl p-12 text-center space-y-3">
                  <p className="font-display text-xl font-semibold text-zinc-900">
                    No manuscripts match your current filter
                  </p>
                  <p className="text-sm text-zinc-600">
                    Clear your search or choose another genre to explore debut works.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGenre('All');
                      setSearchQuery('');
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-lg border border-[#D8D3C8] text-sm font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {filteredBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      book={book}
                      onSelect={(selected) => {
                        setSelectedBookId(selected.id);
                        setActiveView('detail');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      onSelectAuthor={handleOpenAuthorPage}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Section 3: How FirstFolio Works */}
            <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-16 border-t border-[#E6E3DC] space-y-10">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  From First Draft to Print Run
                </p>
                <h2 className="font-display text-3xl font-bold text-zinc-900">
                  How beginner authors publish on FirstFolio
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white border border-[#E6E3DC] rounded-xl p-6 space-y-3">
                  <p className="font-mono text-xs font-semibold text-[#1E3A8A]">01.</p>
                  <h3 className="font-display text-xl font-semibold text-zinc-900">
                    Activate $1/Month Author Membership
                  </h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Subscribe for just <span className="font-mono font-medium text-zinc-900">$1.00/month</span> inside your Author Studio to unlock manuscript publishing and patronage campaigns.
                  </p>
                </div>

                <div className="bg-white border border-[#E6E3DC] rounded-xl p-6 space-y-3">
                  <p className="font-mono text-xs font-semibold text-[#1E3A8A]">02.</p>
                  <h3 className="font-display text-xl font-semibold text-zinc-900">
                    Post Your Excerpt &amp; Publishing Budget
                  </h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Upload your opening chapter, choose a cover edition, and itemize your editing, design, and print costs so backers see exactly what they fund.
                  </p>
                </div>

                <div className="bg-white border border-[#E6E3DC] rounded-xl p-6 space-y-3">
                  <p className="font-mono text-xs font-semibold text-[#1E3A8A]">03.</p>
                  <h3 className="font-display text-xl font-semibold text-zinc-900">
                    Collect Reader Ratings &amp; Donations
                  </h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Readers evaluate your writing with 1–5 star craft critiques and contribute directly toward bringing your debut book into print.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Clean Editorial Footer */}
      <footer className="border-t border-[#E6E3DC] bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="space-y-1">
            <p className="font-display text-base font-semibold text-zinc-900">FirstFolio</p>
            <p>
              Independent debut publishing · Author membership $1/month
            </p>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => handleNavigate('catalog')}
              className="hover:text-zinc-900 transition-colors cursor-pointer"
            >
              Catalog
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('how-it-works')}
              className="hover:text-zinc-900 transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('studio')}
              className="hover:text-zinc-900 transition-colors cursor-pointer"
            >
              Author Studio
            </button>
          </div>
        </div>
      </footer>
      <EmailToastStack toasts={emailToasts} onDismiss={handleDismissToast} />
    </div>
  );
}

export default App;

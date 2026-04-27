import { useState, useMemo, lazy, Suspense, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Table2, Search, LayoutGrid, Info, X } from 'lucide-react';
import { SearchModal } from '../components/search/SearchModal';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useTouchDevice } from '../hooks/useTouchDevice';
import { motion, AnimatePresence } from 'framer-motion';
import { PAGE_TRANSITION, DURATION, EASING, TRANSITION } from '@/lib/motion-tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { resources } from '../data';
import type { NormalizedResource } from '../types/resource';
import { InspoChat } from '../components/ui/InspoChat';
import { CategoryButtons } from '../components/ui/CategoryButtons';
import { AIFilterResponse } from '../components/ui/AIFilterResponse';
import InspoResourceTooltip from '../components/ui/InspoResourceTooltip';
import { InspoTable } from '../components/ui/InspoTable';
import { CardView } from '../components/card-view';
import {
  semanticSearch,
  generateAIResponse,
  generateCategoryResponse,
} from '../lib/search';
import { performLLMSearch } from '../hooks/useLLMSearch';

// Lazy load the 3D canvas for better initial load
const InspoCanvas = lazy(() => import('../components/canvas/InspoCanvas'));
import { CanvasErrorBoundary } from '../components/canvas/CanvasErrorBoundary';
import { AILoader } from '../components/ui/AILoader';
import { UniverseLegend } from '../components/canvas/UniverseLegend';
import { LandingPage } from '../components/landing/LandingPage';

/**
 * Home Page
 *
 * Main view for the design resource universe.
 * Features 3D orbital visualization or table view,
 * with search, filtering, and category navigation.
 *
 * Enhanced with LLM-powered search for complex queries.
 */
export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [legendOpen, setLegendOpen] = useState(false);
  const [legendButtonRect, setLegendButtonRect] = useState<DOMRect | null>(null);
  const legendButtonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const isTouchDevice = useTouchDevice();

  // Universe loading state
  type LoadingPhase = 'loading' | 'ready';
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('loading');
  const loadStartTime = useRef(Date.now());

  // Safety timeout: if canvas never fires onReady, dismiss loader after 8s
  useEffect(() => {
    if (loadingPhase !== 'loading') return;
    const timeout = setTimeout(() => {
      setLoadingPhase('ready');
    }, 8000);
    return () => clearTimeout(timeout);
  }, [loadingPhase]);

  // Display mode from URL params
  type DisplayMode = 'landing' | '3d' | 'table' | 'card';
  const displayMode: DisplayMode = (() => {
    const display = searchParams.get('display');
    if (display === '3d') return '3d';
    if (display === 'table') return 'table';
    if (display === 'card') return 'card';
    return 'landing';
  })();

  // Top-rated resources (9+) for the landing logo carousel, highest first
  const topResources = useMemo(() => {
    return resources
      .filter((r) => r.gravityScore >= 9)
      .sort((a, b) => (b.gravityScore || 0) - (a.gravityScore || 0));
  }, []);

  // Deferred landing exit — sequenced content→background fade before navigation
  const exitTargetRef = useRef<string | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLandingExiting, setIsLandingExiting] = useState(false);

  const handleLandingNavigate = useCallback((display: '3d' | 'card' | 'table') => {
    if (prefersReducedMotion) {
      setSearchParams({ display });
      return;
    }
    // Clear any previous exit timer
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    exitTargetRef.current = display;
    setIsLandingExiting(true);

    // Guaranteed navigation after exit animation (500ms)
    // This lives in Home rather than LandingPage so it can't be
    // disrupted by child re-renders or unstable callback references.
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      const target = exitTargetRef.current;
      if (!target) return; // Already navigated via onExitComplete
      exitTargetRef.current = null;
      setIsLandingExiting(false);
      setSearchParams({ display: target });
    }, 500);
  }, [prefersReducedMotion, setSearchParams]);

  const handleLandingExitComplete = useCallback(() => {
    const target = exitTargetRef.current;
    if (!target) return;
    // Animation completed before timeout — clear it and navigate now
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    exitTargetRef.current = null;
    setIsLandingExiting(false);
    setSearchParams({ display: target });
  }, [setSearchParams]);

  // Read filter params from URL for table view
  const categoryParam = searchParams.get('category');
  const subCategoryParam = searchParams.get('subCategory');
  const pricingParam = searchParams.get('pricing');
  const tierParam = searchParams.get('tier');
  const featuredParam = searchParams.get('featured');
  const opensourceParam = searchParams.get('opensource');

  // Filter state
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredResourceIds, setFilteredResourceIds] = useState<number[] | null>(null);
  const [matchedCategories, setMatchedCategories] = useState<string[]>([]);

  // Sync URL params to filter state on mount/change
  useEffect(() => {
    if (categoryParam !== activeCategory) {
      setActiveCategory(categoryParam);
    }
    if (subCategoryParam !== activeSubCategory) {
      setActiveSubCategory(subCategoryParam);
    }
  }, [categoryParam, subCategoryParam]);

  // AI response state
  const messageIdRef = useRef(0);
  const [aiMessage, setAiMessage] = useState<{ id: number; text: string } | null>(null);
  const [isAiTyping, setIsAiTyping] = useState(false);

  // Tooltip state
  const [hoveredResource, setHoveredResource] = useState<NormalizedResource | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Mobile sort state - default to rating descending
  type MobileSortOption = 'rating' | 'free-first' | 'paid-first';
  const [mobileSortOption, _setMobileSortOption] = useState<MobileSortOption>('rating');

  // Keyboard shortcuts
  useKeyboardShortcuts({
    'cmd+k': useCallback(() => setIsSearchModalOpen(true), []),
  });

  // Auto-dismiss tooltip after 5 seconds (extended for touch device interaction)
  useEffect(() => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // If there is a hovered resource, set auto-dismiss timeout
    if (hoveredResource) {
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredResource(null);
      }, 5000); // 5 seconds - extended for touch device interaction
    }

    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [hoveredResource]);

  // Clear tooltip when leaving 3D view (prevents card carrying over to other pages)
  useEffect(() => {
    if (displayMode !== '3d') {
      setHoveredResource(null);
    }
  }, [displayMode]);

  // Filter resources based on category, subcategory, and semantic search
  const filteredResources = useMemo(() => {
    // Start with all resources or filter by category/subcategory
    let baseResources = resources;

    if (activeCategory) {
      baseResources = baseResources.filter(r => r.category === activeCategory);
    }

    if (activeSubCategory) {
      baseResources = baseResources.filter(r => r.subCategory === activeSubCategory);
    }

    // Apply semantic search if there's a query
    if (searchQuery) {
      const { results } = semanticSearch(baseResources, searchQuery, {
        minResults: 3,
        maxResults: 50,
        includeFallback: true,
      });

      return results.map(r => r.resource);
    }

    return baseResources;
  }, [activeCategory, activeSubCategory, searchQuery]);

  // Sort resources for mobile view
  // @ts-expect-error - Prepared for mobile list implementation
  const _sortedFilteredResources = useMemo(() => {
    const toSort = [...filteredResources];
    
    switch (mobileSortOption) {
      case 'rating':
        return toSort.sort((a, b) => (b.gravityScore || 0) - (a.gravityScore || 0));
      case 'free-first':
        return toSort.sort((a, b) => {
          const pricingOrder = { 'Free': 0, 'Freemium': 1, 'Paid': 2 };
          const aOrder = pricingOrder[a.pricing as keyof typeof pricingOrder] ?? 3;
          const bOrder = pricingOrder[b.pricing as keyof typeof pricingOrder] ?? 3;
          return aOrder - bOrder;
        });
      case 'paid-first':
        return toSort.sort((a, b) => {
          const pricingOrder = { 'Paid': 0, 'Freemium': 1, 'Free': 2 };
          const aOrder = pricingOrder[a.pricing as keyof typeof pricingOrder] ?? 3;
          const bOrder = pricingOrder[b.pricing as keyof typeof pricingOrder] ?? 3;
          return aOrder - bOrder;
        });
      default:
        return toSort;
    }
  }, [filteredResources, mobileSortOption]);

  /**
   * Handle search submission with LLM-enhanced semantic search
   *
   * For simple queries (tool names, short terms): uses fast local search
   * For complex queries (filters, concepts, comparisons): uses Claude for parsing
   */
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setIsAiTyping(true);

    try {
      // Use LLM-enhanced search for intelligent query parsing
      const searchResult = await performLLMSearch(query, {
        enableLLM: true,
        timeout: 5000,
      });

      const { results, metadata, aiResponse, isLLMEnhanced } = searchResult;

      // Extract matched resource IDs for filtering
      const ids = results.map(r => r.resource.id);
      setFilteredResourceIds(ids);

      // Extract matched categories for multi-ring highlighting
      const categories = [...new Set(results.map(r => r.resource.category).filter(Boolean))] as string[];
      setMatchedCategories(categories);

      // Build response message with filter context
      let message = aiResponse.message;
      
      // Add context about applied filters if LLM was used
      if (isLLMEnhanced && metadata.appliedFilters) {
        const filters = metadata.appliedFilters;
        const filterParts: string[] = [];
        
        if (filters.pricing?.length) {
          filterParts.push(`${filters.pricing.join(' or ')} resources`);
        }
        if (filters.minGravityScore !== undefined) {
          filterParts.push(`rated ${filters.minGravityScore}+`);
        }
        if (filters.categories?.length) {
          filterParts.push(`in ${filters.categories.join(', ')}`);
        }
        
        if (filterParts.length > 0 && results.length > 0) {
          message = `Found ${results.length} ${filterParts.join(', ')}.`;
        } else if (results.length === 0 && filterParts.length > 0) {
          message = `No resources match: ${filterParts.join(', ')}. Try broadening your search.`;
        }
      }

      messageIdRef.current += 1;
      setAiMessage({ id: messageIdRef.current, text: message });
    } catch (error) {
      console.error('Search error:', error);
      
      // Fallback to basic search on error
      const { results, metadata } = semanticSearch(resources, query, {
        minResults: 3,
        maxResults: 50,
        includeFallback: true,
      });

      const ids = results.map(r => r.resource.id);
      setFilteredResourceIds(ids);

      const categories = [...new Set(results.map(r => r.resource.category).filter(Boolean))] as string[];
      setMatchedCategories(categories);

      const aiResponse = generateAIResponse(results, metadata);
      messageIdRef.current += 1;
      setAiMessage({ id: messageIdRef.current, text: aiResponse.message });
    } finally {
      setIsAiTyping(false);
    }
  }, []);

  // Handle resource click — two-tap flow on touch devices
  const handleResourceClick = useCallback((resource: NormalizedResource) => {
    if (isTouchDevice && displayMode === '3d') {
      // First tap: show resource card centered on screen
      setHoveredResource(resource);
      setMousePosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
    } else {
      // Desktop: single click navigates directly
      navigate(`/resource/${resource.id}`);
    }
  }, [isTouchDevice, displayMode, navigate]);

  // Handle touch miss — dismiss resource card when tapping empty space
  const handleCanvasMiss = useCallback(() => {
    setHoveredResource(null);
  }, []);

  // Handle resource hover
  const handleResourceHover = (resource: NormalizedResource | null, position?: { x: number; y: number }) => {
    setHoveredResource(resource);
    if (position) {
      setMousePosition(position);
    }
  };

  // Dismiss AI response
  const dismissAiResponse = useCallback(() => {
    setAiMessage(null);
    setSearchQuery('');
    setFilteredResourceIds(null);
    setMatchedCategories([]);
  }, []);

  // Handle category change with AI response
  const handleCategoryChange = (category: string | null) => {
    setActiveCategory(category);
    setActiveSubCategory(null);
    setSearchQuery('');
    setFilteredResourceIds(null);  // Clear search filter
    setMatchedCategories([]);       // Clear matched categories
    setHoveredResource(null);       // Clear tooltip to prevent stuck state

    // Update URL params to stay in sync
    if (category) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('category', category);
        next.delete('subCategory');
        return next;
      });
      const categoryResources = resources.filter(r => r.category === category);
      const response = generateCategoryResponse(category, categoryResources.length);
      messageIdRef.current += 1;
      setAiMessage({ id: messageIdRef.current, text: response.message });
    } else {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('category');
        next.delete('subCategory');
        return next;
      });
      setAiMessage(null);
    }
  };

  // Handle subcategory change
  const handleSubCategoryChange = (subCategory: string | null) => {
    setActiveSubCategory(subCategory);
    setSearchQuery('');
    setHoveredResource(null);       // Clear tooltip to prevent stuck state

    // Update URL params to stay in sync
    if (subCategory && activeCategory) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('subCategory', subCategory);
        return next;
      });
      const filtered = resources.filter(
        r => r.category === activeCategory && r.subCategory === subCategory
      );
      messageIdRef.current += 1;
      setAiMessage({ id: messageIdRef.current, text: `Showing ${filtered.length} ${subCategory.toLowerCase()} resources.` });
    } else if (activeCategory) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('subCategory');
        return next;
      });
      // Reset to just category message
      const categoryResources = resources.filter(r => r.category === activeCategory);
      const response = generateCategoryResponse(activeCategory, categoryResources.length);
      messageIdRef.current += 1;
      setAiMessage({ id: messageIdRef.current, text: response.message });
    } else {
      setAiMessage(null);
    }
  };

  return (
    <div className="h-dvh text-os-text-primary-dark font-sans overflow-hidden">
      {/* Skip to main content - accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[999] focus:px-4 focus:py-2 focus:bg-brand-aperol focus:text-white focus:rounded-md focus:outline-none"
      >
        Skip to main content
      </a>

      {/* 3D Canvas - FIXED BELOW HEADERS (only in 3D mode) */}
      {displayMode === '3d' && (
        <div className="fixed inset-x-0 top-[124px] bottom-[220px] z-0">
          {/* Top gradient - aggressive fade from dark for seamless blend */}
          <div
            className="absolute top-0 inset-x-0 h-32 pointer-events-none z-10"
            style={{ background: 'var(--canvas-gradient-top)' }}
          />
          {/* Loader overlay */}
          <AnimatePresence>
            {loadingPhase === 'loading' && (
              <motion.div
                key="loader"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.normal, ease: EASING.smooth }}
                className="absolute inset-0 z-50 bg-os-bg-dark"
              >
                <AILoader />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Universe - renders behind loader overlay at full opacity */}
          <div className="w-full h-full">
            <CanvasErrorBoundary
              onError={() => {
                // Switch to card view on canvas error
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('display', 'card');
                  return next;
                });
                setLoadingPhase('ready');
              }}
            >
              <Suspense fallback={null}>
                <InspoCanvas
                  resources={resources}
                  activeCategory={activeCategory}
                  activeSubFilter={activeSubCategory}
                  filteredResourceIds={filteredResourceIds}
                  matchedCategories={matchedCategories}
                  onResourceClick={handleResourceClick}
                  onResourceHover={handleResourceHover}
                  onMiss={handleCanvasMiss}
                  onReady={() => {
                    const elapsed = Date.now() - loadStartTime.current;
                    const minDisplayTime = 3000; // Ensure at least 2 full ripple cycles
                    const remaining = Math.max(0, minDisplayTime - elapsed);
                    if (remaining > 0) {
                      setTimeout(() => setLoadingPhase('ready'), remaining);
                    } else {
                      setLoadingPhase('ready');
                    }
                  }}
                />
              </Suspense>
            </CanvasErrorBoundary>
          </div>
        </div>
      )}

      {/* UI Overlay Container */}
      <div className={`relative z-[258] h-full flex flex-col overflow-hidden ${displayMode === '3d' ? 'pointer-events-none' : ''}`}>
        {/* Header - Semi-transparent with backdrop blur */}
        <header className={`pointer-events-auto flex-shrink-0 sticky top-0 z-[260] backdrop-blur-xl border-b border-[var(--border-secondary)] shadow-sm h-16 ${displayMode === '3d' ? 'bg-[var(--bg-primary)]' : 'bg-[var(--bg-primary)]'}`}>
        <div className="max-w-7xl mx-auto px-6 h-full">
          <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mark-it brand mark - resets filters */}
            <button
              onClick={() => {
                setSearchParams({});
                setActiveCategory(null);
                setActiveSubCategory(null);
                setSearchQuery('');
                setAiMessage(null);
                setFilteredResourceIds(null);
                setMatchedCategories([]);
              }}
              className="flex items-center justify-center w-10 h-[39px] bg-os-surface-dark/50 rounded-md border border-[var(--border-secondary)] hover:opacity-80 transition-opacity"
              aria-label="Reset filters"
            >
              <span className="font-notable text-sm text-[var(--logo-fill)]">M</span>
            </button>
            <span className="font-notable text-base md:text-lg text-[var(--logo-fill)] leading-none">
              Mark-it
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Search Button - hidden on mobile, visible on desktop */}
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="hidden md:flex items-center justify-between h-10 min-w-[200px] lg:min-w-[240px] px-3 bg-os-surface-dark/50 border border-[var(--border-secondary)] rounded-lg text-os-text-secondary-dark hover:text-os-text-primary-dark hover:border-brand-aperol/30 transition-all"
              title="Search resources (⌘K)"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                <span className="text-sm">Search...</span>
              </div>
              <kbd className="hidden lg:inline text-[10px] px-1.5 py-0.5 bg-os-bg-dark rounded border border-[var(--border-secondary)]">⌘K</kbd>
            </button>

          {/* Search button - visible on mobile only */}
          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="flex md:hidden items-center justify-center w-10 h-10 bg-os-surface-dark/50 border border-[var(--border-secondary)] rounded-lg text-os-text-secondary-dark hover:text-os-text-primary-dark hover:border-brand-aperol/30 transition-all"
            aria-label="Search resources"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* GitHub repository link */}
          <a
            href="https://github.com/opensesh/OS_design-directory"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-10 h-10 bg-os-surface-dark/50 border border-[var(--border-secondary)] rounded-lg text-os-text-secondary-dark hover:text-brand-aperol hover:border-brand-aperol/30 transition-all"
            aria-label="View source on GitHub"
          >
            <svg className="w-5 h-5" viewBox="0 0 98 96" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M41.4395 69.3848C28.8066 67.8535 19.9062 58.7617 19.9062 46.9902C19.9062 42.2051 21.6289 37.0371 24.5 33.5918C23.2559 30.4336 23.4473 23.7344 24.8828 20.959C28.7109 20.4805 33.8789 22.4902 36.9414 25.2656C40.5781 24.1172 44.4062 23.543 49.0957 23.543C53.7852 23.543 57.6133 24.1172 61.0586 25.1699C64.0254 22.4902 69.2891 20.4805 73.1172 20.959C74.457 23.543 74.6484 30.2422 73.4043 33.4961C76.4668 37.1328 78.0937 42.0137 78.0937 46.9902C78.0937 58.7617 69.1934 67.6621 56.3691 69.2891C59.623 71.3945 61.8242 75.9883 61.8242 81.252L61.8242 91.2051C61.8242 94.0762 64.2168 95.7031 67.0879 94.5547C84.4102 87.9512 98 70.6289 98 49.1914C98 22.1074 75.9883 0 48.9043 0C21.8203 0 0 22.1074 0 49.1914C0 70.4375 13.4941 88.0469 31.6777 94.6504C34.2617 95.6074 36.75 93.8848 36.75 91.3008L36.75 83.6445C35.4102 84.2188 33.6875 84.6016 32.1562 84.6016C25.8398 84.6016 22.1074 81.1563 19.4277 74.7441C18.375 72.1602 17.2266 70.6289 15.0254 70.3418C13.877 70.2461 13.4941 69.7676 13.4941 69.1934C13.4941 68.0449 15.4082 67.1836 17.3223 67.1836C20.0977 67.1836 22.4902 68.9063 24.9785 72.4473C26.8926 75.2227 28.9023 76.4668 31.2949 76.4668C33.6875 76.4668 35.2187 75.6055 37.4199 73.4043C39.0469 71.7773 40.291 70.3418 41.4395 69.3848Z" />
            </svg>
          </a>
          </div>
        </div>
        </div>
      </header>

      {/* Subheader - View Mode Indicator (hidden on landing) */}
      <AnimatePresence initial={false}>
      {displayMode !== 'landing' && (
      <motion.section
        key="subheader"
        initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
        transition={prefersReducedMotion ? { duration: DURATION.fast } : {
          height: { duration: DURATION.slow, ease: EASING.smooth },
          opacity: { duration: DURATION.normal, delay: 0.05 },
        }}
        style={{ overflow: 'hidden' }}
        className={`pointer-events-auto flex-shrink-0 relative z-[260] border-b border-[var(--border-secondary)] ${displayMode === '3d' ? 'bg-[var(--bg-primary)] backdrop-blur-xl' : 'bg-[var(--bg-primary)] backdrop-blur-xl'}`}
        role="region"
        aria-label="Current view"
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Label + View Name + Description */}
            <div className="flex flex-col gap-0.5">
              <span className="text-caption font-text uppercase tracking-wider text-os-text-secondary-dark">
                Mark-it
              </span>
              <AnimatePresence mode="wait">
                <motion.h2
                  key={displayMode}
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: DURATION.normal, ease: EASING.smooth }}
                  className="text-h3 md:text-h3-tablet font-notable text-brand-aperol"
                  aria-live="polite"
                >
                  {displayMode === '3d' && 'Universe View'}
                  {displayMode === 'card' && 'Card View'}
                  {displayMode === 'table' && 'Table View'}
                </motion.h2>
              </AnimatePresence>
            </div>

            {/* Right: View toggle (all screen sizes) */}
            <div className="flex items-center bg-[var(--bg-secondary)] rounded-lg p-1 border border-[var(--border-secondary)] backdrop-blur-xl">
              <button
                onClick={() => setSearchParams({ display: '3d' })}
                className={`p-2 rounded-md transition-all ${
                  displayMode === '3d'
                    ? 'bg-brand-aperol text-white'
                    : 'text-os-text-secondary-dark hover:text-os-text-primary-dark hover:bg-[var(--bg-tertiary)]'
                }`}
                aria-label="3D View"
                aria-current={displayMode === '3d' ? 'page' : undefined}
              >
                <Box className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSearchParams({ display: 'card' })}
                className={`p-2 rounded-md transition-all ${
                  displayMode === 'card'
                    ? 'bg-brand-aperol text-white'
                    : 'text-os-text-secondary-dark hover:text-os-text-primary-dark hover:bg-[var(--bg-tertiary)]'
                }`}
                aria-label="Card View"
                aria-current={displayMode === 'card' ? 'page' : undefined}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSearchParams({ display: 'table' })}
                className={`p-2 rounded-md transition-all ${
                  displayMode === 'table'
                    ? 'bg-brand-aperol text-white'
                    : 'text-os-text-secondary-dark hover:text-os-text-primary-dark hover:bg-[var(--bg-tertiary)]'
                }`}
                aria-label="Table View"
                aria-current={displayMode === 'table' ? 'page' : undefined}
              >
                <Table2 className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      </motion.section>
      )}
      </AnimatePresence>

      {/* Content Area - FLEX-1 fills remaining space */}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 relative min-h-0 overflow-hidden outline-none ${displayMode === '3d' ? '' : 'pointer-events-auto'}`}
      >
        {/* Views: Landing, 3D (empty spacer), Card, Table */}
        <AnimatePresence mode="wait">
          {displayMode === 'landing' && (
            <motion.div
              key="landing"
              initial={prefersReducedMotion ? PAGE_TRANSITION.reduced.initial : PAGE_TRANSITION.viewSwitch.initial}
              animate={{
                ...(prefersReducedMotion ? PAGE_TRANSITION.reduced.animate : PAGE_TRANSITION.viewSwitch.animate),
                transition: prefersReducedMotion ? PAGE_TRANSITION.reduced.transition : PAGE_TRANSITION.viewSwitch.transition,
              }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="w-full h-full pointer-events-auto"
            >
              <LandingPage
                resources={topResources}
                totalCount={resources.length}
                onNavigate={handleLandingNavigate}
                isExiting={isLandingExiting}
                onExitComplete={handleLandingExitComplete}
              />
            </motion.div>
          )}

          {displayMode === '3d' && (
            <motion.div
              key="3d"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.normal, ease: EASING.smooth }}
              className="w-full h-full"
            />
          )}

          {displayMode === 'card' && (
            <motion.div
              key="card"
              initial={prefersReducedMotion ? PAGE_TRANSITION.reduced.initial : PAGE_TRANSITION.viewSwitch.initial}
              animate={prefersReducedMotion ? PAGE_TRANSITION.reduced.animate : PAGE_TRANSITION.viewSwitch.animate}
              exit={prefersReducedMotion ? PAGE_TRANSITION.reduced.exit : PAGE_TRANSITION.viewSwitch.exit}
              transition={prefersReducedMotion ? PAGE_TRANSITION.reduced.transition : PAGE_TRANSITION.viewSwitch.transition}
              className="w-full h-full"
              style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
            >
              <CardView resources={resources} />
            </motion.div>
          )}

          {displayMode === 'table' && (
            <motion.div
              key="table"
              initial={prefersReducedMotion ? PAGE_TRANSITION.reduced.initial : PAGE_TRANSITION.viewSwitch.initial}
              animate={prefersReducedMotion ? PAGE_TRANSITION.reduced.animate : PAGE_TRANSITION.viewSwitch.animate}
              exit={prefersReducedMotion ? PAGE_TRANSITION.reduced.exit : PAGE_TRANSITION.viewSwitch.exit}
              transition={prefersReducedMotion ? PAGE_TRANSITION.reduced.transition : PAGE_TRANSITION.viewSwitch.transition}
              className="w-full h-full overflow-auto"
              style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
            >
              <div className="max-w-7xl mx-auto">
                <InspoTable
                  resources={resources}
                  initialCategory={categoryParam || undefined}
                  initialSubCategory={subCategoryParam || undefined}
                  initialPricing={pricingParam || undefined}
                  initialTier={tierParam || undefined}
                  initialFeatured={featuredParam || undefined}
                  initialOpensource={opensourceParam || undefined}
                  isFromUrl={!!(categoryParam || subCategoryParam || pricingParam || tierParam || featuredParam || opensourceParam)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Controls - Only show in 3D mode */}
      <AnimatePresence>
        {displayMode === '3d' && (
          <motion.div
            className="flex-shrink-0 relative z-20"
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: DURATION.slow, ease: EASING.smooth }}
          >
            {/* Solid background - instant exit to prevent rectangle artifact */}
            <motion.div
              className="absolute inset-0 bg-[var(--bg-primary)] pointer-events-none"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0 }}
            />
            
            {/* Bottom gradient - matches top gradient for seamless blend */}
            <motion.div
              className="absolute -top-32 left-0 right-0 h-32 pointer-events-none z-10"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0 }}
              style={{ background: 'var(--canvas-gradient-bottom)' }}
            />

            <div className="relative z-20 w-full max-w-7xl mx-auto px-6 pt-2 pb-6 space-y-3 pointer-events-auto">
              {/* AI Response - absolutely positioned to overlay without pushing layout */}
              <div className="relative">
                <AnimatePresence>
                  {aiMessage && (
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                      transition={TRANSITION.normal}
                      className="absolute bottom-full left-0 right-0 mb-3 pointer-events-auto"
                    >
                      <AIFilterResponse
                        messageId={aiMessage?.id}
                        message={aiMessage?.text ?? null}
                        isTyping={isAiTyping}
                        onDismiss={dismissAiResponse}
                        matchCount={filteredResourceIds ? filteredResourceIds.length : filteredResources.length}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Search Input */}
              <InspoChat
                onSubmit={handleSearch}
                isLoading={isAiTyping}
                placeholder="Describe what you're looking for... (e.g., 'tools for YouTube creators')"
              />

              {/* Category Buttons */}
              <CategoryButtons
                resources={resources}
                activeCategory={activeCategory}
                activeSubCategory={activeSubCategory}
                onCategoryChange={handleCategoryChange}
                onSubCategoryChange={handleSubCategoryChange}
              />

              {/* Resource count */}
              <div className="flex items-center justify-center" role="status" aria-live="polite">
                <p className="flex items-center gap-2 text-sm text-os-text-secondary-dark">
                  <span className="text-lg font-semibold text-brand-aperol">
                    {filteredResourceIds ? filteredResourceIds.length : filteredResources.length}
                  </span>
                  <span>design resources</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      {/* End of UI Overlay Container */}

      {/* Tooltip - only shown in 3D view, outside overlay for proper z-index */}
      {displayMode === '3d' && (
        <InspoResourceTooltip
          resource={hoveredResource}
          mousePosition={mousePosition}
          isTouchDevice={isTouchDevice}
          onClick={(resource) => {
            setHoveredResource(null);
            navigate(`/resource/${resource.id}`);
          }}
        />
      )}

      {/* Search Modal - needs to be outside overlay for proper z-index */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectResource={(resource) => {
          setIsSearchModalOpen(false);
          navigate(`/resource/${resource.id}`);
        }}
      />

      {/* Legend Button - Fixed position outside canvas for proper z-index */}
      {displayMode === '3d' && (
        <div className="fixed top-[164px] inset-x-0 z-[260] pointer-events-none">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-end pointer-events-auto">
              <motion.button
                ref={legendButtonRef}
                onClick={() => {
                  if (legendButtonRef.current) {
                    setLegendButtonRect(legendButtonRef.current.getBoundingClientRect());
                  }
                  setLegendOpen(!legendOpen);
                }}
                whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                transition={TRANSITION.springSnappy}
                aria-label={legendOpen ? "Close legend" : "Open legend"}
                className="p-2.5 bg-[var(--bg-primary)] backdrop-blur-xl rounded-lg border border-[var(--border-secondary)] text-os-text-secondary-dark hover:text-brand-aperol hover:border-brand-aperol/30 transition-all shadow-lg"
              >
                {legendOpen ? <X className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* Legend Backdrop + Dropdown - needs to be outside overlay for proper z-index */}
      <AnimatePresence>
        {legendOpen && (
          <motion.div
            key="legend-backdrop"
            className="fixed inset-x-0 bottom-0 z-[259] bg-[var(--bg-primary)] backdrop-blur-md"
            style={{ top: 137 }}
            initial={PAGE_TRANSITION.backdrop.initial}
            animate={PAGE_TRANSITION.backdrop.animate}
            exit={PAGE_TRANSITION.backdrop.exit}
            transition={PAGE_TRANSITION.backdrop.transition}
            onClick={() => setLegendOpen(false)}
            aria-hidden="true"
          />
        )}
        {legendOpen && legendButtonRect && (
          <motion.div
            key="legend-dropdown"
            className="fixed z-[300]"
            // TODO: legendButtonRect and window.innerWidth are captured once on open,
            // so the dropdown position won't update on window resize. Acceptable for
            // launch since the legend closes on any backdrop click. To fix, add a
            // resize listener that recalculates position while the dropdown is open.
            style={{
              top: legendButtonRect.bottom + 8,
              // TODO: Position is calculated once when dropdown opens; does not update on window resize.
              // Acceptable for launch since legend closes on backdrop click.
              right: window.innerWidth - legendButtonRect.right,
            }}
            initial={prefersReducedMotion ? PAGE_TRANSITION.reduced.initial : PAGE_TRANSITION.modal.initial}
            animate={prefersReducedMotion ? PAGE_TRANSITION.reduced.animate : PAGE_TRANSITION.modal.animate}
            exit={prefersReducedMotion ? PAGE_TRANSITION.reduced.exit : PAGE_TRANSITION.modal.exit}
            transition={prefersReducedMotion ? PAGE_TRANSITION.reduced.transition : PAGE_TRANSITION.modal.transition}
          >
            <UniverseLegend isOpen={legendOpen} onClose={() => setLegendOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

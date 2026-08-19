import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink, Search, X, Plus } from 'lucide-react';
import type { NormalizedResource } from '../../types/resource';
import { isNewResource } from '../../lib/is-new-resource';
import { MobileResourceCard } from './MobileResourceCard';
import { GravityScoreBadge } from './GravityScoreBadge';
import { ResourceLogo } from './ResourceLogo';

// Animation variants for staggered row entrance
const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.02,
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1]
    }
  })
};

// Shared easing for consistent feel
const smoothEase = [0.4, 0, 0.2, 1];

// Rating range filter options
const RATING_RANGES = [
  { value: 'all', label: 'All', min: 0, max: 10 },
  { value: '9-10', label: '9-10', min: 9.0, max: 10.0 },
  { value: '8-9', label: '8-9', min: 8.0, max: 8.99 },
  { value: '7-8', label: '7-8', min: 7.0, max: 7.99 },
  { value: '6-7', label: '6-7', min: 6.0, max: 6.99 },
  { value: 'below-6', label: 'Below 6', min: 0, max: 5.99 },
] as const;

const CATEGORY_SUBCATEGORY_MAP: Record<string, readonly string[]> = {
  'AI Tools': ['Audio', 'Video', 'Assistants', 'Generative'],
  Tools: ['Development', 'Productivity', 'Design'],
  Inspiration: ['Typography', 'UI/UX', '3D Mockups', 'Design Archive'],
  Learning: ['Courses', 'Docs'],
  Templates: ['Mockups', 'UI Kits'],
};

function getAvailableSubCategories(
  category: string,
  allSubCategories: string[],
  dataset: NormalizedResource[],
): string[] {
  if (category === 'all') {
    return allSubCategories;
  }

  const fromCategory = new Set<string>();
  dataset.forEach((resource) => {
    if (resource.category === category && resource.subCategory) {
      fromCategory.add(resource.subCategory);
    }
  });
  const categorySubCategories = Array.from(fromCategory).sort();

  const mapped = CATEGORY_SUBCATEGORY_MAP[category];
  if (mapped) {
    const relevant = mapped.filter((sub) => fromCategory.has(sub));
    if (relevant.length > 0) return relevant;
  }

  return categorySubCategories;
}

const RATING_VALUES = new Set(RATING_RANGES.map((range) => range.value));
const FILTER_URL_KEYS = ['category', 'subCategory', 'pricing', 'rating', 'added', 'search'] as const;

interface TableFilterSnapshot {
  category: string;
  subCategory: string;
  pricing: string;
  rating: string;
  added: string;
  search: string;
}

function readFiltersFromSearchParams(params: URLSearchParams): TableFilterSnapshot {
  return {
    category: params.get('category') || 'all',
    subCategory: params.get('subCategory') || 'all',
    pricing: params.get('pricing') || 'all',
    rating: params.get('rating') || 'all',
    added: params.get('added') || 'all',
    search: params.get('search') || '',
  };
}

function sanitizeTableFilters(
  raw: TableFilterSnapshot,
  filterOptions: { categories: string[]; subCategories: string[]; pricings: string[] },
  dataset: NormalizedResource[],
): TableFilterSnapshot {
  const category =
    raw.category !== 'all' && !filterOptions.categories.includes(raw.category)
      ? 'all'
      : raw.category;

  const availableSubCategories = getAvailableSubCategories(
    category,
    filterOptions.subCategories,
    dataset,
  );
  const subCategory =
    raw.subCategory !== 'all' && !availableSubCategories.includes(raw.subCategory)
      ? 'all'
      : raw.subCategory;

  const pricing =
    raw.pricing !== 'all' && !filterOptions.pricings.includes(raw.pricing)
      ? 'all'
      : raw.pricing;

  const rating = RATING_RANGES.some((range) => range.value === raw.rating)
    ? raw.rating
    : 'all';

  const added = raw.added === 'new' ? 'new' : 'all';

  return {
    category,
    subCategory,
    pricing,
    rating,
    added,
    search: raw.search,
  };
}

function writeFiltersToSearchParams(
  prev: URLSearchParams,
  filters: TableFilterSnapshot,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const apply = (key: string, value: string, isDefault: boolean) => {
    if (isDefault) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  };

  apply('category', filters.category, filters.category === 'all');
  apply('subCategory', filters.subCategory, filters.subCategory === 'all');
  apply('pricing', filters.pricing, filters.pricing === 'all');
  apply('rating', filters.rating, filters.rating === 'all');
  apply('added', filters.added, filters.added === 'all');
  apply('search', filters.search, filters.search.trim() === '');

  const unchanged = FILTER_URL_KEYS.every((key) => next.get(key) === prev.get(key));
  return unchanged ? prev : next;
}

function NewResourceBadge({ isNew }: { isNew: boolean }) {
  if (!isNew) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-[#00ff88] px-1.5 py-0.5 text-[10px] font-bold uppercase text-black">
      NEW
    </span>
  );
}

interface InspoTableProps {
  resources: NormalizedResource[];
  initialCategory?: string;
  initialSubCategory?: string;
  initialPricing?: string;
  initialTier?: string;
  initialFeatured?: string;
  initialOpensource?: string;
  isFromUrl?: boolean;
}

type SortField = 'name' | 'category' | 'subCategory' | 'pricing' | 'gravityScore';
type SortDirection = 'asc' | 'desc' | null;

export function InspoTable({
  resources,
  initialCategory,
  initialSubCategory,
  initialPricing,
  initialTier,
  initialFeatured,
  initialOpensource,
  isFromUrl,
}: InspoTableProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilters = readFiltersFromSearchParams(searchParams);

  // Filter state - initialize from URL, then existing props
  const [categoryFilter, setCategoryFilter] = useState<string>(
    urlFilters.category !== 'all' ? urlFilters.category : initialCategory || 'all',
  );
  const [subCategoryFilter, setSubCategoryFilter] = useState<string>(
    urlFilters.subCategory !== 'all' ? urlFilters.subCategory : initialSubCategory || 'all',
  );
  const [pricingFilter, setPricingFilter] = useState<string>(
    urlFilters.pricing !== 'all' ? urlFilters.pricing : initialPricing || 'all',
  );
  const [ratingFilter, setRatingFilter] = useState<string>(urlFilters.rating);
  const [newFilter, setNewFilter] = useState<string>(urlFilters.added);
  const [tierFilter, _setTierFilter] = useState<string>(initialTier || 'all');
  const [featuredFilter, _setFeaturedFilter] = useState<string>(initialFeatured || 'all');
  const [opensourceFilter, _setOpensourceFilter] = useState<string>(initialOpensource || 'all');
  const [searchQuery, setSearchQuery] = useState<string>(urlFilters.search);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Track if user has modified filters (hides the URL filter banner)
  const [userHasModifiedFilters, setUserHasModifiedFilters] = useState(false);

  // Determine active filter label for the banner
  const activeFilterLabel = useMemo(() => {
    const labels: string[] = [];
    if (categoryFilter !== 'all') labels.push(categoryFilter);
    if (subCategoryFilter !== 'all') labels.push(subCategoryFilter);
    if (pricingFilter !== 'all') labels.push(pricingFilter);
    if (ratingFilter !== 'all') labels.push(`Rating ${ratingFilter}`);
    if (newFilter === 'new') labels.push('New (Last 7 Days)');
    if (searchQuery) labels.push(`“${searchQuery}”`);
    if (tierFilter !== 'all') labels.push(`Tier ${tierFilter}`);
    if (featuredFilter === 'true') labels.push('Featured');
    if (opensourceFilter === 'true') labels.push('Open Source');
    return labels.join(', ');
  }, [categoryFilter, subCategoryFilter, pricingFilter, ratingFilter, newFilter, searchQuery, tierFilter, featuredFilter, opensourceFilter]);

  const hasActiveFilters = activeFilterLabel.length > 0;
  const showFilterBanner = isFromUrl && hasActiveFilters && !userHasModifiedFilters;

  // Clear all filters
  const clearFilters = () => {
    setCategoryFilter('all');
    setSubCategoryFilter('all');
    setPricingFilter('all');
    setRatingFilter('all');
    setNewFilter('all');
    setSearchQuery('');
    setUserHasModifiedFilters(true);
  };

  // Sort state - default to rating descending (highest first)
  const [sortField, setSortField] = useState<SortField | null>('gravityScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Sticky filter bar height tracking
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const [filterBarHeight, setFilterBarHeight] = useState(0);

  useEffect(() => {
    const el = filterContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setFilterBarHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Extract unique values for filters
  const filterOptions = useMemo(() => {
    const categories = new Set<string>();
    const subCategories = new Set<string>();
    const pricings = new Set<string>();

    resources.forEach((resource) => {
      if (resource.category) categories.add(resource.category);
      if (resource.subCategory) subCategories.add(resource.subCategory);
      if (resource.pricing) pricings.add(resource.pricing);
    });

    return {
      categories: Array.from(categories).sort(),
      subCategories: Array.from(subCategories).sort(),
      pricings: Array.from(pricings).sort(),
    };
  }, [resources]);

  const availableSubCategories = useMemo(
    () => getAvailableSubCategories(categoryFilter, filterOptions.subCategories, resources),
    [categoryFilter, filterOptions.subCategories, resources],
  );

  const sanitizedFilters = useMemo(
    () =>
      sanitizeTableFilters(
        {
          category: categoryFilter,
          subCategory: subCategoryFilter,
          pricing: pricingFilter,
          rating: ratingFilter,
          added: newFilter,
          search: searchQuery,
        },
        filterOptions,
        resources,
      ),
    [categoryFilter, subCategoryFilter, pricingFilter, ratingFilter, newFilter, searchQuery, filterOptions, resources],
  );

  // Drop invalid URL/state values (including dependent sub-category mismatches)
  useEffect(() => {
    if (sanitizedFilters.category !== categoryFilter) setCategoryFilter(sanitizedFilters.category);
    if (sanitizedFilters.subCategory !== subCategoryFilter) setSubCategoryFilter(sanitizedFilters.subCategory);
    if (sanitizedFilters.pricing !== pricingFilter) setPricingFilter(sanitizedFilters.pricing);
    if (sanitizedFilters.rating !== ratingFilter) setRatingFilter(sanitizedFilters.rating);
    if (sanitizedFilters.added !== newFilter) setNewFilter(sanitizedFilters.added);
  }, [sanitizedFilters, categoryFilter, subCategoryFilter, pricingFilter, ratingFilter, newFilter]);

  // Keep filter query params in sync without wiping display or other params
  useEffect(() => {
    setSearchParams((prev) => writeFiltersToSearchParams(prev, sanitizedFilters), { replace: true });
  }, [sanitizedFilters, setSearchParams]);

  const categorySelectValue =
    sanitizedFilters.category === 'all' || filterOptions.categories.includes(sanitizedFilters.category)
      ? sanitizedFilters.category
      : 'all';

  const subCategorySelectValue = availableSubCategories.includes(sanitizedFilters.subCategory)
    ? sanitizedFilters.subCategory
    : 'all';

  const pricingSelectValue =
    sanitizedFilters.pricing === 'all' || filterOptions.pricings.includes(sanitizedFilters.pricing)
      ? sanitizedFilters.pricing
      : 'all';

  const ratingSelectValue = RATING_VALUES.has(
    sanitizedFilters.rating as typeof RATING_RANGES[number]['value'],
  )
    ? sanitizedFilters.rating
    : 'all';

  const addedSelectValue = sanitizedFilters.added === 'new' ? 'new' : 'all';

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setUserHasModifiedFilters(true);

    const nextSubCategories = getAvailableSubCategories(
      value,
      filterOptions.subCategories,
      resources,
    );
    if (subCategoryFilter !== 'all' && !nextSubCategories.includes(subCategoryFilter)) {
      setSubCategoryFilter('all');
    }
  };

  const handleSubCategoryChange = (value: string) => {
    setSubCategoryFilter(value);
    setUserHasModifiedFilters(true);
  };

  const handlePricingChange = (value: string) => {
    setPricingFilter(value);
    setUserHasModifiedFilters(true);
  };

  const handleRatingChange = (value: string) => {
    setRatingFilter(value);
    setUserHasModifiedFilters(true);
  };

  const handleNewFilterChange = (value: string) => {
    setNewFilter(value);
    setUserHasModifiedFilters(true);
  };

  // Apply filters and sorting
  const filteredAndSortedResources = useMemo(() => {
    let filtered = resources.filter((resource) => {
      const categoryMatch = categoryFilter === 'all' || resource.category === categoryFilter;
      const subCategoryMatch = subCategoryFilter === 'all' || resource.subCategory === subCategoryFilter;
      const pricingMatch = pricingFilter === 'all' || resource.pricing === pricingFilter;
      const tierMatch = tierFilter === 'all' || String(resource.tier) === tierFilter;
      const featuredMatch = featuredFilter === 'all' || (featuredFilter === 'true' && resource.featured);
      const opensourceMatch = opensourceFilter === 'all' || (opensourceFilter === 'true' && resource.opensource);

      // Rating filter
      const ratingRange = RATING_RANGES.find(r => r.value === ratingFilter);
      const ratingMatch = !ratingRange || ratingFilter === 'all' || 
        (resource.gravityScore >= ratingRange.min && resource.gravityScore <= ratingRange.max);

        const addedDate = resource.dateAdded ?? null;
      const newMatch = newFilter === 'all' || (newFilter === 'new' && isNewResource(addedDate ?? ''));

      // Search filter
      const searchMatch = !searchQuery ||
        resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      return categoryMatch && subCategoryMatch && pricingMatch && tierMatch && featuredMatch && opensourceMatch && searchMatch && ratingMatch && newMatch;
    });

    // Apply sorting
    if (sortField && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];
        
        // Handle numeric sorting for gravityScore
        if (sortField === 'gravityScore') {
          const aNum = typeof aValue === 'number' ? aValue : 0;
          const bNum = typeof bValue === 'number' ? bValue : 0;
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // String comparison for other fields
        const aStr = aValue?.toString() || '';
        const bStr = bValue?.toString() || '';
        const comparison = aStr.localeCompare(bStr);
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [resources, categoryFilter, subCategoryFilter, pricingFilter, ratingFilter, newFilter, tierFilter, featuredFilter, opensourceFilter, searchQuery, sortField, sortDirection]);

  // Handle sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort icon for header
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-4 h-4 opacity-40" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="w-4 h-4 text-brand-aperol" />;
    }
    return <ChevronDown className="w-4 h-4 text-brand-aperol" />;
  };

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: smoothEase }}
    >
      {/* Sticky filter container - filter banner + filter bar */}
      <div
        ref={filterContainerRef}
        className="sticky top-0 z-20 bg-[var(--bg-primary)] backdrop-blur-xl"
      >
        {/* Filter Active Banner - shows when navigating from ResourceDetail */}
        {showFilterBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: smoothEase }}
            className="flex items-center justify-between px-4 py-2 bg-[#FF0000]/10 border-b border-[var(--border-secondary)]"
          >
            <span className="text-sm text-[#FF0000] font-medium">
              Showing results for: {activeFilterLabel}
            </span>
            <button
              onClick={clearFilters}
              className="text-xs text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] transition-colors"
            >
              Clear filter
            </button>
          </motion.div>
        )}

        {/* Sticky filter header + collapsible panel */}
        <div className="bg-[var(--bg-primary)] backdrop-blur-xl border-b border-[var(--border-secondary)]">
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              {!filtersOpen && (
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)]/30 px-3 py-1.5 text-xs font-medium text-[var(--fg-primary)] transition-colors hover:bg-[var(--bg-secondary)]/60 hover:border-[var(--fg-tertiary)] focus-visible:outline-none focus-visible:border-[var(--border-primary)]"
                  aria-expanded={false}
                  aria-controls="inspo-filter-panel"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Filters
                </button>
              )}
              {filtersOpen && (
                <span className="text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)]">
                  Filters
                </span>
              )}
              {!filtersOpen && hasActiveFilters && (
                <span className="hidden min-w-0 truncate text-xs text-[var(--fg-tertiary)] sm:inline">
                  {activeFilterLabel}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="text-xs sm:text-sm text-[var(--fg-secondary)]">
                <span className="font-accent text-brand-aperol">{filteredAndSortedResources.length}</span>
                {' '}of{' '}
                <span className="font-medium">{resources.length}</span>
                {' '}resources
              </div>
              {filtersOpen && (
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-secondary)]/50 hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:border focus-visible:border-[var(--border-primary)]"
                  aria-label="Close filters"
                  aria-expanded={true}
                  aria-controls="inspo-filter-panel"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                id="inspo-filter-panel"
                key="inspo-filter-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: smoothEase }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 md:px-6 md:pb-6 space-y-4">
                  {/* Desktop: Flex row with filters right-aligned */}
                  {/* Mobile: Stack vertically with labels visible */}
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    {/* Search Filter */}
                    <div className="w-full md:w-auto">
                      <label htmlFor="search-filter" className="block text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] mb-2">
                        Search
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-secondary)]" />
                        <input
                          id="search-filter"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter resources..."
                          className="w-full md:w-48 pl-9 pr-8 py-2 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg text-xs sm:text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-primary)]/60 focus:border-[var(--border-primary)] transition-colors"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filter Dropdowns - 5 columns on mobile, flex row on desktop */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 md:flex gap-3 md:gap-4">
                      {/* Category Filter */}
                      <div className="flex flex-col">
                        <label htmlFor="category-filter" className="block text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] mb-2">
                          Category
                        </label>
                        <select
                          id="category-filter"
                          value={categorySelectValue}
                          onChange={(e) => handleCategoryChange(e.target.value)}
                          className="px-2 sm:px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg text-xs sm:text-sm text-[var(--fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-primary)]/60 focus:border-[var(--border-primary)] transition-colors cursor-pointer hover:border-[var(--fg-tertiary)] truncate"
                        >
                          <option value="all">All</option>
                          {filterOptions.categories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Sub-category Filter */}
                      <div className="flex flex-col">
                        <label htmlFor="subcategory-filter" className="block text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] mb-2">
                          Sub-cat
                        </label>
                        <select
                          id="subcategory-filter"
                          value={subCategorySelectValue}
                          onChange={(e) => handleSubCategoryChange(e.target.value)}
                          className="px-2 sm:px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg text-xs sm:text-sm text-[var(--fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-primary)]/60 focus:border-[var(--border-primary)] transition-colors cursor-pointer hover:border-[var(--fg-tertiary)] truncate"
                        >
                          <option value="all">All</option>
                          {availableSubCategories.map((subCategory) => (
                            <option key={subCategory} value={subCategory}>
                              {subCategory}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Pricing Filter */}
                      <div className="flex flex-col">
                        <label htmlFor="pricing-filter" className="block text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] mb-2">
                          Pricing
                        </label>
                        <select
                          id="pricing-filter"
                          value={pricingSelectValue}
                          onChange={(e) => handlePricingChange(e.target.value)}
                          className="px-2 sm:px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg text-xs sm:text-sm text-[var(--fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-primary)]/60 focus:border-[var(--border-primary)] transition-colors cursor-pointer hover:border-[var(--fg-tertiary)] truncate"
                        >
                          <option value="all">All</option>
                          {filterOptions.pricings.map((pricing) => (
                            <option key={pricing} value={pricing}>
                              {pricing}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Rating Filter */}
                      <div className="flex flex-col">
                        <label htmlFor="rating-filter" className="block text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] mb-2">
                          Rating
                        </label>
                        <select
                          id="rating-filter"
                          value={ratingSelectValue}
                          onChange={(e) => handleRatingChange(e.target.value)}
                          className="px-2 sm:px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg text-xs sm:text-sm text-[var(--fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-primary)]/60 focus:border-[var(--border-primary)] transition-colors cursor-pointer hover:border-[var(--fg-tertiary)] truncate"
                        >
                          {RATING_RANGES.map((range) => (
                            <option key={range.value} value={range.value}>
                              {range.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* New Filter */}
                      <div className="flex flex-col">
                        <label htmlFor="new-filter" className="block text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] mb-2">
                          Added
                        </label>
                        <select
                          id="new-filter"
                          value={addedSelectValue}
                          onChange={(e) => handleNewFilterChange(e.target.value)}
                          className="px-2 sm:px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-lg text-xs sm:text-sm text-[var(--fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-primary)]/60 focus:border-[var(--border-primary)] transition-colors cursor-pointer hover:border-[var(--fg-tertiary)] truncate"
                        >
                          <option value="all">All</option>
                          <option value="new">New (Last 7 Days)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden">
        {filteredAndSortedResources.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: smoothEase }}
            className="p-8 text-center text-[var(--fg-secondary)] text-sm"
          >
            No resources match the selected filters.
          </motion.div>
        ) : (
          filteredAndSortedResources.map((resource, index) => (
            <motion.div
              key={resource.id}
              custom={index}
              initial="hidden"
              animate="visible"
              variants={rowVariants}
            >
              <MobileResourceCard
                resource={resource}
                onClick={() => navigate(`/resource/${resource.id}`)}
              />
            </motion.div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block">
        <table className="w-full border-collapse">
          <motion.thead
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1, ease: smoothEase }}
            className="sticky z-10 bg-[var(--bg-primary)] backdrop-blur-xl shadow-[0_1px_0_0_var(--border-secondary)]"
            style={{ top: filterBarHeight }}
          >
            <tr className="border-b border-[var(--border-secondary)]">
              {/* Thumbnail Header */}
              <th className="w-16 p-4 bg-[var(--bg-primary)]">
                <span className="sr-only">Thumbnail</span>
              </th>

              {/* Name Header */}
              <th className="text-left p-4 bg-[var(--bg-primary)]">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-2 text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] hover:text-brand-aperol transition-colors group"
                >
                  Name
                  {getSortIcon('name')}
                </button>
              </th>

              {/* Category Header */}
              <th className="text-left p-4 bg-[var(--bg-primary)]">
                <button
                  onClick={() => handleSort('category')}
                  className="flex items-center gap-2 text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] hover:text-brand-aperol transition-colors group"
                >
                  Category
                  {getSortIcon('category')}
                </button>
              </th>

              {/* Sub-category Header */}
              <th className="text-left p-4 bg-[var(--bg-primary)] hidden lg:table-cell">
                <button
                  onClick={() => handleSort('subCategory')}
                  className="flex items-center gap-2 text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] hover:text-brand-aperol transition-colors group"
                >
                  Sub-category
                  {getSortIcon('subCategory')}
                </button>
              </th>

              {/* Pricing Header */}
              <th className="text-left p-4 bg-[var(--bg-primary)]">
                <button
                  onClick={() => handleSort('pricing')}
                  className="flex items-center gap-2 text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] hover:text-brand-aperol transition-colors group"
                >
                  Pricing
                  {getSortIcon('pricing')}
                </button>
              </th>

              {/* Rating Header */}
              <th className="text-left p-4 bg-[var(--bg-primary)]">
                <button
                  onClick={() => handleSort('gravityScore')}
                  className="flex items-center gap-2 text-xs font-accent uppercase tracking-wider text-[var(--fg-secondary)] hover:text-brand-aperol transition-colors group"
                >
                  Rating
                  {getSortIcon('gravityScore')}
                </button>
              </th>

              {/* Actions Header */}
              <th className="w-20 p-4 bg-[var(--bg-primary)]">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </motion.thead>
          <tbody>
            {filteredAndSortedResources.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-[var(--fg-secondary)]">
                  No resources match the selected filters.
                </td>
              </tr>
            ) : (
              filteredAndSortedResources.map((resource, index) => (
                <motion.tr
                  key={resource.id}
                  custom={index}
                  initial="hidden"
                  animate="visible"
                  variants={rowVariants}
                  onClick={() => navigate(`/resource/${resource.id}`)}
                  className="border-b border-[var(--border-secondary)] bg-[var(--bg-primary_alt)] hover:bg-[var(--bg-secondary)] transition-colors group cursor-pointer"
                >
                  {/* Thumbnail Column */}
                  <td className="p-4">
                    <ResourceLogo resource={resource} size="md" />
                  </td>

                  {/* Name Column - Links to detail page */}
                  <td className="p-4">
                  <span className="inline-flex items-center gap-2 font-medium text-[var(--fg-primary)] group-hover:text-brand-aperol transition-colors">
  {resource.name}
  {isNewResource(resource.dateAdded ?? '') && (
    <NewResourceBadge isNew={true} />
  )}
</span>
                  </td>

                  {/* Category Column */}
                  <td className="p-4 text-[var(--fg-secondary)]">
                    {resource.category || '-'}
                  </td>

                  {/* Sub-category Column */}
                  <td className="p-4 text-[var(--fg-secondary)] hidden lg:table-cell">
                    {resource.subCategory || '-'}
                  </td>

                  {/* Pricing Column */}
                  <td className="p-4">
                    {resource.pricing ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] text-xs font-accent font-bold uppercase text-[var(--fg-primary)] border border-[var(--border-secondary)]">
                        {resource.pricing}
                      </span>
                    ) : (
                      <span className="text-[var(--fg-secondary)]">-</span>
                    )}
                  </td>

                  {/* Rating Column */}
                  <td className="p-4">
                    {resource.gravityScore ? (
                      <GravityScoreBadge
                        score={resource.gravityScore}
                        size="sm"
                        showTooltip={false}
                      />
                    ) : (
                      <span className="text-[var(--fg-secondary)]">-</span>
                    )}
                  </td>

                  {/* Actions Column - External Link */}
                  <td className="p-4">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-[var(--fg-secondary)] hover:text-brand-aperol hover:border-[var(--fg-tertiary)] transition-all"
                      title={`Visit ${resource.name}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

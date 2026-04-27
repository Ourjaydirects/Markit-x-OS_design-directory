import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DURATION, EASING } from '../lib/motion-tokens';
import {
  ArrowLeft,
  ExternalLink,
  Tag,
  DollarSign,
  Star,
  Code,
  Globe,
  Folder,
  Layers,
  Copy,
  Check,
  ArrowUpRight,
  Search,
  ChevronRight,
  Box,
  LayoutGrid,
  Table2,
} from 'lucide-react';
import { resources } from '../data';
import { RatingScale } from '../components/ui/RatingScale';
import { SearchModal } from '../components/search/SearchModal';
import { ResourceLogo } from '../components/ui/ResourceLogo';

/**
 * Get domain from URL
 */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * Split description into two paragraphs at a sentence boundary near the middle
 */
function splitDescription(description: string): [string, string] {
  // Find all sentence endings (. followed by space and capital letter, or end of string)
  const sentences = description.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [description];

  if (sentences.length <= 2) {
    // If only 1-2 sentences, split at first sentence
    const firstSentence = sentences[0]?.trim() || '';
    const rest = sentences.slice(1).join('').trim();
    return [firstSentence, rest];
  }

  // Find the split point closest to the middle
  const midpoint = description.length / 2;
  let currentLength = 0;
  let splitIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    currentLength += sentences[i].length;
    if (currentLength >= midpoint) {
      // Choose this or previous based on which is closer to middle
      splitIndex = i + 1;
      break;
    }
  }

  // Ensure we don't have empty paragraphs
  if (splitIndex === 0) splitIndex = 1;
  if (splitIndex >= sentences.length) splitIndex = sentences.length - 1;

  const firstPart = sentences.slice(0, splitIndex).join('').trim();
  const secondPart = sentences.slice(splitIndex).join('').trim();

  return [firstPart, secondPart];
}

/**
 * Pricing badge styles based on pricing type
 */
function getPricingStyle(pricing: string | null) {
  if (!pricing) return { bg: 'bg-[var(--bg-secondary)]', text: 'text-[var(--fg-secondary)]', border: 'border-[var(--border-secondary)]' };

  const lower = pricing.toLowerCase();
  if (lower === 'free') return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  if (lower === 'freemium') return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
  if (lower === 'paid' || lower === 'pay per use') return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' };
  return { bg: 'bg-[var(--bg-secondary)]', text: 'text-[var(--fg-secondary)]', border: 'border-[var(--border-secondary)]' };
}

/**
 * ResourceDetail Page
 *
 * Displays detailed information about a single resource with:
 * - Browser mockup frame for screenshots
 * - Hero section with favicon/thumbnail
 * - About section with description and tags
 * - Details section with category, pricing, and badges
 * - Related resources section with smart matching
 */
export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [screenshotError, setScreenshotError] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Find the resource
  const resource = resources.find(r => r.id === Number(id));

  // Calculate related resources based on shared tags, category, and subcategory
  const relatedResources = useMemo(() => {
    if (!resource) return [];

    const resourceTags = resource.tags || [];

    return resources
      .filter(r => r.id !== resource.id)
      .map(r => {
        let score = 0;
        const rTags = r.tags || [];

        // +3 points per shared tag
        const sharedTags = resourceTags.filter(t =>
          rTags.some(rt => rt.toLowerCase() === t.toLowerCase())
        );
        score += sharedTags.length * 3;

        // +2 points for same sub-category
        if (r.subCategory && r.subCategory === resource.subCategory) score += 2;

        // +1 point for same category
        if (r.category && r.category === resource.category) score += 1;

        return { resource: r, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(s => s.resource);
  }, [resource]);

  // Preload screenshot image to get dimensions for adaptive aspect ratio
  useEffect(() => {
    if (resource?.screenshot) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = resource.screenshot;
    } else {
      setImageDimensions(null);
    }
  }, [resource?.screenshot]);

  // Scroll to top when resource changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [id]);

  // Calculate aspect ratio dynamically based on image dimensions
  const aspectRatio = imageDimensions
    ? `${imageDimensions.width}/${imageDimensions.height}`
    : '16/10'; // fallback while loading

  // Copy URL to clipboard
  const copyUrl = async () => {
    if (resource) {
      try {
        await navigator.clipboard.writeText(resource.url);
        setUrlCopied(true);
        setTimeout(() => setUrlCopied(false), 2000);
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = resource.url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setUrlCopied(true);
        setTimeout(() => setUrlCopied(false), 2000);
      }
    }
  };

  // Handle resource not found
  if (!resource) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--fg-primary)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-4">Resource Not Found</h1>
          <p className="text-[var(--fg-tertiary)] mb-6">The resource you're looking for doesn't exist.</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FE5102] text-white rounded-lg hover:bg-[#FE5102]/90 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Universe
          </Link>
        </div>
      </div>
    );
  }

  const domain = getDomain(resource.url);
  const pricingStyle = getPricingStyle(resource.pricing);
  const hasScreenshot = resource.screenshot && !screenshotError;

  return (
    <div className="min-h-screen bg-transparent text-[var(--fg-primary)]">
      {/* Skip to main content - accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[999] focus:px-4 focus:py-2 focus:bg-brand-aperol focus:text-white focus:rounded-md focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Header - Consistent with Home */}
      <header className="sticky top-0 z-10 bg-[var(--bg-primary)] backdrop-blur-xl border-b border-[var(--border-secondary)] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Left: Mark-it brand */}
          <Link
            to="/"
            className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center justify-center w-10 h-[39px] bg-[var(--bg-secondary)]/30 rounded-md border border-[var(--border-secondary)]">
              <span className="font-notable text-sm text-[var(--logo-fill)]">M</span>
            </div>
            <span className="font-notable text-base md:text-lg text-[var(--logo-fill)] leading-none">
              Mark-it
            </span>
          </Link>

          {/* Right: Search buttons */}
          <div className="flex items-center gap-3">
            {/* Search Button - hidden on mobile, visible on desktop */}
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="hidden md:flex items-center justify-between h-10 min-w-[200px] lg:min-w-[240px] px-3 bg-[var(--bg-secondary)]/30 border border-[var(--border-secondary)] rounded-lg text-[var(--fg-secondary)] hover:text-os-text-primary-dark hover:border-brand-aperol/30 transition-all"
              title="Search resources (⌘K)"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                <span className="text-sm">Search...</span>
              </div>
              <kbd className="hidden lg:inline text-[10px] px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--border-secondary)]">⌘K</kbd>
            </button>

            {/* Search button - visible on mobile only */}
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="flex md:hidden items-center justify-center w-10 h-10 bg-[var(--bg-secondary)]/30 border border-[var(--border-secondary)] rounded-lg text-[var(--fg-secondary)] hover:text-os-text-primary-dark hover:border-brand-aperol/30 transition-all"
              aria-label="Search resources"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Subheader - Visible on all viewports */}
      <section className="border-b border-[var(--border-secondary)] bg-[var(--bg-primary)] backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            {/* Left: Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-sm min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors flex-shrink-0"
                aria-label="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <Link
                to={`/?display=table&category=${encodeURIComponent(resource.category || '')}`}
                className="text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] truncate transition-colors"
              >
                {resource.category || 'Resource'}
              </Link>
              <ChevronRight className="w-3 h-3 shrink-0 text-[var(--fg-tertiary)]" />
              <span className="text-[var(--fg-primary)] truncate">
                {resource.subCategory || resource.name}
              </span>
            </nav>

            {/* Right: View toggle */}
            <div className="flex items-center bg-[var(--bg-secondary)]/30 rounded-lg p-1 border border-[var(--border-secondary)] flex-shrink-0">
              <Link
                to="/"
                className="p-2 rounded-md transition-all text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                aria-label="3D View"
              >
                <Box className="w-4 h-4" />
              </Link>
              <Link
                to="/?display=card"
                className="p-2 rounded-md transition-all text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                aria-label="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </Link>
              <Link
                to={`/?display=table&category=${encodeURIComponent(resource.category || '')}`}
                className="p-2 rounded-md transition-all bg-brand-aperol text-white"
                aria-label="Table View"
              >
                <Table2 className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="max-w-5xl mx-auto px-6 py-8 outline-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: DURATION.slow, ease: EASING.smooth }}
          >
          {/* Screenshot Container with Actions */}
          {hasScreenshot && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-8"
            >
              <div className="relative bg-[var(--bg-primary)] rounded-xl p-6 flex items-center justify-center backdrop-blur-xl border border-[var(--border-secondary)]">
                {/* Browser Mockup - centered with adaptive aspect ratio */}
                <div className="rounded-lg overflow-hidden border border-[var(--border-secondary)]/50 max-w-2xl w-full shadow-2xl max-h-[70vh]">
                  {/* Browser chrome with traffic lights */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-secondary)]">
                    {/* Traffic lights */}
                    <div className="flex gap-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                    </div>
                    {/* URL bar */}
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-secondary)] rounded-md max-w-xs w-full">
                        <Globe className="w-3 h-3 text-[var(--fg-tertiary)] flex-shrink-0" />
                        <span className="text-[11px] text-[var(--fg-tertiary)] truncate">{domain}</span>
                      </div>
                    </div>
                    {/* Spacer for symmetry */}
                    <div className="w-[42px]" />
                  </div>
                  {/* Screenshot - adaptive aspect ratio based on image dimensions */}
                  <div
                    className="relative bg-zinc-950"
                    style={{
                      aspectRatio,
                      maxHeight: 'calc(70vh - 100px)', // Account for browser chrome and padding
                      width: '100%',
                    }}
                  >
                    <img
                      src={resource.screenshot!}
                      alt={`Screenshot of ${resource.name}`}
                      className="w-full h-full object-contain"
                      onError={() => setScreenshotError(true)}
                    />
                  </div>
                </div>


              </div>
            </motion.div>
          )}

          {/* Title + Tags Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-12"
          >
            {/* Icon + Title + Buttons Row */}
            <div className="flex items-start gap-4">
              {/* Thumbnail/Favicon */}
              <ResourceLogo resource={resource} size="xl" faviconSize="lg" className="shadow-lg" />

              {/* Title + Domain + Buttons */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  {/* Title + Domain - Independent hover states */}
                  <div className="min-w-0 flex-1">
                    {/* Title link */}
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2"
                    >
                      <h1 className="text-2xl md:text-3xl font-bold tracking-tight group-hover:text-[#FE5102] transition-colors">
                        {resource.name}
                      </h1>
                      <motion.span
                        className="text-[var(--fg-tertiary)] group-hover:text-[#FE5102] transition-colors"
                        whileHover={{ x: 2, y: -2 }}
                      >
                        <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </motion.span>
                    </a>
                    
                    {/* Domain link - independent hover */}
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1.5 text-[var(--fg-secondary)] hover:text-[#FE5102] transition-colors mt-1"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span className="text-sm truncate">{domain}</span>
                      <motion.span
                        whileHover={{ x: 2, y: -2 }}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </motion.span>
                    </a>

                    {/* Tags - Desktop/Tablet: inside left column, tight to URL */}
                    {resource.tags && resource.tags.length > 0 && (
                      <div className="hidden md:flex flex-wrap gap-1.5 mt-2">
                        {resource.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)]/40 text-[var(--fg-secondary)]"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>


                  {/* Action buttons - responsive */}
                  <div className="flex gap-1.5 sm:flex-col sm:gap-2 flex-shrink-0">
                    {/* Website Link */}
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Visit website"
                      className="inline-flex items-center justify-center gap-2 rounded-lg transition-colors bg-[#FE5102] text-white hover:bg-[#FE5102]/90 w-10 h-10 sm:w-auto sm:px-3 sm:py-2 lg:px-4 lg:py-2 text-xs sm:text-sm font-medium"
                    >
                      <ArrowUpRight className="w-4 h-4 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                      <span className="hidden sm:inline">Website</span>
                    </a>
                    
                    {/* Copy Button */}
                    <button
                      onClick={copyUrl}
                      aria-label={urlCopied ? "URL copied" : "Copy URL"}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border transition-all w-10 h-10 sm:w-auto sm:px-3 sm:py-2 lg:px-3 lg:py-2 text-xs sm:text-sm ${
                        urlCopied 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-[var(--bg-secondary)]/30 border-[var(--border-secondary)] text-[var(--fg-secondary)] hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--fg-primary)]'
                      }`}
                    >
                      {urlCopied ? (
                        <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                      ) : (
                        <Copy className="w-4 h-4 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                      )}
                      <span className="hidden sm:inline">
                        {urlCopied ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Screen reader announcement for copy feedback */}
            {urlCopied && (
              <div role="status" aria-live="polite" className="sr-only">
                URL copied to clipboard
              </div>
            )}

            {/* Tags - Mobile only: outside flex, aligned with icon's left edge */}
            {resource.tags && resource.tags.length > 0 && (
              <div className="mt-2 md:hidden">
                <div className="flex flex-wrap gap-1.5">
                  {resource.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)]/40 text-[var(--fg-secondary)]"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Two-Column Layout: About + Rating/Details */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-12"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Left Column: About (2/3 width on desktop) */}
              <div className="md:col-span-2 order-2 md:order-1">
                {resource.description && (
                  <div>
                    <h2 className="text-xs font-semibold text-[var(--fg-primary)] mb-3 uppercase tracking-wide flex items-center gap-2">
                      <span className="w-6 h-px bg-[#FE5102]" />
                      About
                    </h2>
                    {(() => {
                      const [first, second] = splitDescription(resource.description);
                      return (
                        <div className="space-y-3">
                          <p className="text-sm leading-relaxed text-[var(--fg-secondary)]">
                            {first}
                          </p>
                          {second && (
                            <p className="text-sm leading-relaxed text-[var(--fg-secondary)]">
                              {second}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Right Column: Rating + Details (1/3 width on desktop) */}
              <div className="md:col-span-1 order-1 md:order-2 bg-[var(--bg-secondary)]/20 rounded-lg p-4 space-y-8">
                {/* Rating Section */}
                {resource.gravityScore && (
                  <div>
                    <h2 className="text-xs font-semibold text-[var(--fg-primary)] mb-3 uppercase tracking-wide flex items-center gap-2">
                      <span className="w-6 h-px bg-[#FE5102]" />
                      Rating
                    </h2>
                    <RatingScale
                      score={resource.gravityScore}
                      rationale={resource.gravityRationale}
                      showTooltip={true}
                      animateOnMount
                    />
                  </div>
                )}

                {/* Details Section */}
                <div>
                  <h2 className="text-xs font-semibold text-[var(--fg-primary)] mb-3 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-6 h-px bg-[#FE5102]" />
                    Details
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Category - Aperol colored */}
                    {resource.category && (
                      <Link
                        to={`/?display=table&category=${encodeURIComponent(resource.category)}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FE5102]/10 text-[#FE5102] text-xs border border-[var(--border-secondary)] hover:bg-[#FE5102]/20 transition-colors"
                      >
                        <Folder className="w-2.5 h-2.5" />
                        {resource.category}
                      </Link>
                    )}

                    {/* Subcategory - Gray */}
                    {resource.subCategory && (
                      <Link
                        to={`/?display=table&subCategory=${encodeURIComponent(resource.subCategory)}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-secondary)]/60 text-[var(--fg-secondary)] text-xs border border-[var(--border-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--fg-primary)] transition-colors"
                      >
                        <Layers className="w-2.5 h-2.5" />
                        {resource.subCategory}
                      </Link>
                    )}

                    {/* Pricing - Color coded */}
                    {resource.pricing && (
                      <Link
                        to={`/?display=table&pricing=${encodeURIComponent(resource.pricing)}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border hover:opacity-80 transition-colors ${pricingStyle.bg} ${pricingStyle.text} ${pricingStyle.border}`}
                      >
                        <DollarSign className="w-2.5 h-2.5" />
                        {resource.pricing}
                      </Link>
                    )}

                    {/* Tier - Gray */}
                    {resource.tier && (
                      <Link
                        to={`/?display=table&tier=${resource.tier}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-secondary)]/60 text-[var(--fg-secondary)] text-xs border border-[var(--border-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--fg-primary)] transition-colors"
                      >
                        <Layers className="w-2.5 h-2.5" />
                        Tier {resource.tier}
                      </Link>
                    )}

                    {/* Featured - Amber */}
                    {resource.featured && (
                      <Link
                        to="/?display=table&featured=true"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-xs border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                      >
                        <Star className="w-2.5 h-2.5 fill-current" />
                        Featured
                      </Link>
                    )}

                    {/* Open Source - Emerald */}
                    {resource.opensource && (
                      <Link
                        to="/?display=table&opensource=true"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <Code className="w-2.5 h-2.5" />
                        Open Source
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Related Resources */}
          {relatedResources.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8 pt-6 border-t border-[var(--border-secondary)]"
            >
              <h2 className="text-xs font-semibold text-[var(--fg-primary)] mb-3 uppercase tracking-wide flex items-center gap-2">
                <span className="w-6 h-px bg-[#FE5102]" />
                Related Resources
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {relatedResources.map((related) => (
                    <Link
                      key={related.id}
                      to={`/resource/${related.id}`}
                      className="group flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]/40 border border-[var(--border-secondary)] hover:border-[var(--fg-tertiary)] hover:bg-[var(--bg-secondary)]/60 transition-all"
                    >
                      <ResourceLogo resource={related} size="md" />

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-[var(--fg-primary)] group-hover:text-[#FE5102] transition-colors truncate">
                          {related.name}
                        </h3>
                        <p className="text-xs text-[var(--fg-tertiary)] truncate">
                          {related.subCategory || related.category || 'Resource'}
                        </p>
                      </div>

                      <ExternalLink className="w-3.5 h-3.5 text-[var(--fg-tertiary)] group-hover:text-[#FE5102] transition-colors flex-shrink-0" />
                    </Link>
                  ))}
              </div>
            </motion.div>
          )}
        </motion.div>
        </AnimatePresence>
      </main>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectResource={(selectedResource) => {
          setIsSearchModalOpen(false);
          navigate(`/resource/${selectedResource.id}`);
        }}
      />
    </div>
  );
}

import { Timestamp } from 'firebase/firestore';
import { BookCampaign, CoverTone } from '../types';

export const HERO_EDITORIAL_IMAGE = '/src/assets/images/hero_author_desk_1795723982931.jpg';

export interface CoverPreset {
  id: string;
  label: string;
  imageUrl: string;
  tone: CoverTone;
}

export const COVER_PRESETS: CoverPreset[] = [
  {
    id: 'glass_orchard',
    label: 'Botanical Conservatory',
    imageUrl: '/src/assets/images/cover_glass_orchard_1795723982921.jpg',
    tone: 'sage',
  },
  {
    id: 'salt_meridian',
    label: 'Nocturnal Horizon',
    imageUrl: '/src/assets/images/cover_salt_meridian_1795723984297.jpg',
    tone: 'cobalt',
  },
  {
    id: 'quiet_kiln',
    label: 'Stoneware & Linen',
    imageUrl: '/src/assets/images/cover_quiet_kiln_1795723985697.jpg',
    tone: 'alabaster',
  },
  {
    id: 'clockwork_canto',
    label: 'Celestial Ginkgo',
    imageUrl: '/src/assets/images/cover_clockwork_canto_1795723984321.jpg',
    tone: 'charcoal',
  },
];

export const SHOWCASE_BOOK_SEEDS: Omit<BookCampaign, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'showcase_the_glass_orchard',
    authorId: 'showcase_author_elena_vance',
    authorPenName: 'Elena Vance',
    authorBio:
      'Former botanical archivist writing her debut novel in Portland. Seven years researching heirloom seed banks inspired this story.',
    title: 'The Glass Orchard',
    subtitle: 'A novel of inheritance, winter light, and forgotten flora',
    genre: 'Literary Fiction',
    format: 'Paperback & eBook',
    pageCount: 284,
    pitch:
      'When a young conservator inherits an abandoned Victorian glasshouse on the Oregon coast, she discovers a catalog of extinct blossoms planted to encode a century-old family secret.',
    excerptTitle: 'Chapter One · The Iron Key',
    excerptText:
      'Rain arrived at Calder Point not in drops but as a pale, salt-heavy veil that blurred the boundary between the spruce ridge and the Pacific. Clara stood before the iron-framed conservatory with her coat collar turned up, watching condensation trace slow rivers down the bowed panes.\n\nHer great-aunt Maeve had left no bank ledger, no deeds to city flats—only three brass keys wrapped in waxed linen and a ledger stamped 1924. When the lock gave with a dry metallic sigh, the air inside smelled unexpectedly warm: damp cedar bark, crushed fern fronds, and the faint almond bitterness of night-blooming camellia.\n\nAlong the central aisle, terracotta labels poked from beds of dark loam. Yet none carried Latin binomials. In Maeve’s cramped cursive, each tag bore a date and a pair of initials. Beside a grafted white fig whose branches pressed against the curved glass roof, Clara found a zinc plaque reading: For the year the ferry stopped running—let the root remember what the town forgot.\n\nShe opened the linen ledger on the potting bench. Between pressed petals lay three unsent letters addressed to a shipwright in Astoria, dated the very week the conservatory’s furnace had supposedly gone cold.',
    coverImageUrl: '/src/assets/images/cover_glass_orchard_1795723982921.jpg',
    coverTone: 'sage',
    goalUsd: 2400,
    raisedUsd: 1680,
    donorCount: 34,
    editingCostUsd: 950,
    designCostUsd: 550,
    printingCostUsd: 900,
    ratingSum: 88,
    ratingCount: 18,
    averageRating: 4.9,
    visibility: 'public',
    status: 'seeking_funding',
    isShowcase: true,
  },
  {
    id: 'showcase_salt_meridian',
    authorId: 'showcase_author_marcus_chen',
    authorPenName: 'Marcus Chen',
    authorBio:
      'Marine cartographer turned speculative fiction debut author. Passionate about celestial navigation, quiet oceans, and human endurance.',
    title: 'Salt Meridian',
    subtitle: 'Cartography of an uncharted archipelago',
    genre: 'Sci-Fi & Fantasy',
    format: 'Hardcover Edition',
    pageCount: 336,
    pitch:
      'On an ocean world where magnetic north shifts every lunar cycle, a disgraced navigator joins a wooden brigantine hunting an island that appears on no two charts in the same place.',
    excerptTitle: 'Chapter One · Dead Reckoning',
    excerptText:
      'By the fourth watch, the brass binnacle was lying again. Lin tapped the glass with the knuckle of his thumb and watched the needle tremble three degrees east before settling against the copper rim like a tired moth.\n\nCaptain Halvorsen did not look up from the sounding table. "Current or iron?" she asked, her dividers poised over a sea chart stained dark with tallow.\n\n"Neither," Lin said quietly. "The stars moved half a handbreadth since midnight, and the tide is running uphill."\n\nAboard the brigantine Kestrel, nobody laughed at impossible tides. Three years after the Great Drift, half the southern trade routes had slipped off the brass globes entirely, leaving merchant fleets steering by bird flight and memory. If the Salt Meridian existed—an atoll anchored to deep volcanic basalt that resisted the wandering pole—it would be the last fixed harbor left in the hemisphere.',
    coverImageUrl: '/src/assets/images/cover_salt_meridian_1795723984297.jpg',
    coverTone: 'cobalt',
    goalUsd: 3200,
    raisedUsd: 2560,
    donorCount: 52,
    editingCostUsd: 1200,
    designCostUsd: 700,
    printingCostUsd: 1300,
    ratingSum: 115,
    ratingCount: 24,
    averageRating: 4.8,
    visibility: 'public',
    status: 'seeking_funding',
    isShowcase: true,
  },
  {
    id: 'showcase_notes_from_a_quiet_kiln',
    authorId: 'showcase_author_amara_okafor',
    authorPenName: 'Amara Okafor',
    authorBio:
      'Ceramicist and essayist chronicling apprenticeship, slow craft, and rebuilding a creative life after burnout in Lagos and Kyoto.',
    title: 'Notes from a Quiet Kiln',
    subtitle: 'Twelve essays on clay, patience, and starting late',
    genre: 'Memoir & Essays',
    format: 'Illustrated Monograph',
    pageCount: 192,
    pitch:
      'An intimate debut essay collection about leaving a decade-long corporate career at thirty-four to apprentice in a wood-fired pottery studio.',
    excerptTitle: 'Essay I · The Weight of Wet Clay',
    excerptText:
      'The first rule my teacher gave me had nothing to do with centering clay on the wheel. Every morning at six, before the kiln shed warmed, I was told to sweep the courtyard stones until the cedar needles lay in neat lines by the gate.\n\nFor three weeks I resented the broom. I had crossed two oceans with notebooks full of glaze formulas and earnest questions about firing curves, only to spend my mornings listening to bristles scrape granite. It took a cracked tea bowl—pulled too fast, dried in a draft—to show me what the sweeping was measuring.\n\nClay remembers haste long after your hands leave it. Every tremor of impatience stays hidden inside the wall until the heat reaches twelve hundred degrees, and then the kiln translates your hurry into a hairline fracture.',
    coverImageUrl: '/src/assets/images/cover_quiet_kiln_1795723985697.jpg',
    coverTone: 'alabaster',
    goalUsd: 1500,
    raisedUsd: 1500,
    donorCount: 41,
    editingCostUsd: 550,
    designCostUsd: 400,
    printingCostUsd: 550,
    ratingSum: 142,
    ratingCount: 29,
    averageRating: 4.9,
    visibility: 'public',
    status: 'funded',
    isShowcase: true,
  },
  {
    id: 'showcase_clockwork_canto',
    authorId: 'showcase_author_julian_rowe',
    authorPenName: 'Julian Rowe',
    authorBio:
      'High school history teacher and debut poet crafting lyric sequences rooted in astronomy, family letters, and urban autumn.',
    title: 'Clockwork Canto',
    subtitle: 'Poems for winter observatories and late trains',
    genre: 'Poetry',
    format: 'Paperback & eBook',
    pageCount: 128,
    pitch:
      'Forty-eight linked poems tracing a grandfather’s pocket astrolabe across three generations of midnight shifts, migration, and quiet reconciliation.',
    excerptTitle: 'Canto IV · Brass Meridian',
    excerptText:
      'You kept the sky folded inside a waistcoat pocket—\nthree engraved rings of weathered brass\nthat smelled of machine oil and cedar drawers.\n\nOn nights when the freight yard froze solid,\nyou taught me how to sight Polaris through the steam\nof two paper cups and call the distance home.\n\nNothing we measured ever stayed where we marked it:\nnot the winter solstice, not the platform clock,\nnot the names pressed flat between dictionary pages.',
    coverImageUrl: '/src/assets/images/cover_clockwork_canto_1795723984321.jpg',
    coverTone: 'charcoal',
    goalUsd: 1100,
    raisedUsd: 740,
    donorCount: 19,
    editingCostUsd: 400,
    designCostUsd: 300,
    printingCostUsd: 400,
    ratingSum: 52,
    ratingCount: 11,
    averageRating: 4.7,
    visibility: 'public',
    status: 'seeking_funding',
    isShowcase: true,
  },
];

export function buildPreviewBooks(): BookCampaign[] {
  const now = Timestamp.now();
  return SHOWCASE_BOOK_SEEDS.map((seed) => ({
    ...seed,
    createdAt: now,
    updatedAt: now,
  }));
}

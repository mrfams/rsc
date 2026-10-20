/**
 * Shared design + campus constants.
 *
 * The campus boundary is the real Eastern Mediterranean University
 * multipolygon from OpenStreetMap (relation 15583365), including the main
 * campus and the medical/health campus to the west. The three rings are kept
 * intact so reports, the geofence editor and the map shading all agree.
 *
 * Building/place labels below are curated from OpenStreetMap (ODbL) and are
 * rendered directly on the map so names stay readable even when the basemap
 * tiles are low-detail or satellite imagery.
 */

export const LIGHT = {
  bg: '#F3F5F4',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F9F8',
  text: '#101413',
  textMuted: '#68726E',
  border: '#E3E8E5',
  primary: '#0E7C5A',
  primaryDark: '#0A5E44',
  primarySoft: '#E5F4ED',
  danger: '#D92D20',
  dangerSoft: '#FEF3F2',
  warning: '#B54708',
  warningSoft: '#FFFAEB',
  success: '#067647',
  successSoft: '#ECFDF3',
  info: '#175CD3',
  infoSoft: '#EFF8FF',
  overlay: 'rgba(16, 20, 19, 0.42)',
  glass: 'rgba(255, 255, 255, 0.88)',
};

export const DARK = {
  bg: '#0B1210',
  surface: '#131C19',
  surfaceAlt: '#1A2521',
  text: '#F4F7F5',
  textMuted: '#9AA8A2',
  border: '#283630',
  primary: '#5EE0AE',
  primaryDark: '#34C793',
  primarySoft: '#123D30',
  danger: '#F97066',
  dangerSoft: '#3B1512',
  warning: '#FDB022',
  warningSoft: '#3B2A08',
  success: '#75E0A7',
  successSoft: '#0F2E20',
  info: '#84CAFF',
  infoSoft: '#102A43',
  overlay: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(19, 28, 25, 0.9)',
};

export const COLORS = LIGHT;

export const getThemeColors = (colorScheme: 'light' | 'dark') =>
  colorScheme === 'dark' ? DARK : LIGHT;

/** Category colours for lightweight screens that do not fetch /api/config. */
export const CATEGORY_COLORS: Record<string, string> = {
  plastic: '#0284C7',
  paper: '#7C3AED',
  glass: '#059669',
  metal: '#EA580C',
  battery: '#DC2626',
  general: '#52525B',
  food_waste: '#16A34A',
};

export type CampusPoint = { latitude: number; longitude: number };

/** Centre of the main EMU campus. */
export const CAMPUS_CENTER: CampusPoint = { latitude: 35.14518, longitude: 33.90908 };

/** Zoom that frames the campus with room for the floating UI. */
export const DEFAULT_MAP_ZOOM = 15;

/**
 * Reportable area — the OSM campus multipolygon (relation 15583365).
 * Ring 1 is the main campus; rings 2 + 3 cover the medical/health campus.
 */
export const CAMPUS_POLYGONS: CampusPoint[][] = [
  // ring 1 (63 points)
  [
    { latitude: 35.151528, longitude: 33.903412 },
    { latitude: 35.149878, longitude: 33.903854 },
    { latitude: 35.14949, longitude: 33.902527 },
    { latitude: 35.149473, longitude: 33.902425 },
    { latitude: 35.148165, longitude: 33.902848 },
    { latitude: 35.145325, longitude: 33.903465 },
    { latitude: 35.145285, longitude: 33.903477 },
    { latitude: 35.143541, longitude: 33.904041 },
    { latitude: 35.142692, longitude: 33.9045 },
    { latitude: 35.142275, longitude: 33.904667 },
    { latitude: 35.141834, longitude: 33.90475 },
    { latitude: 35.141779, longitude: 33.904794 },
    { latitude: 35.141748, longitude: 33.904849 },
    { latitude: 35.141121, longitude: 33.906839 },
    { latitude: 35.140744, longitude: 33.907747 },
    { latitude: 35.140304, longitude: 33.908612 },
    { latitude: 35.139829, longitude: 33.909387 },
    { latitude: 35.138949, longitude: 33.910482 },
    { latitude: 35.138343, longitude: 33.911133 },
    { latitude: 35.13894, longitude: 33.912807 },
    { latitude: 35.139865, longitude: 33.912521 },
    { latitude: 35.14032, longitude: 33.912889 },
    { latitude: 35.140214, longitude: 33.913419 },
    { latitude: 35.140108, longitude: 33.913452 },
    { latitude: 35.139834, longitude: 33.913536 },
    { latitude: 35.139991, longitude: 33.914666 },
    { latitude: 35.140345, longitude: 33.915735 },
    { latitude: 35.141669, longitude: 33.914696 },
    { latitude: 35.142082, longitude: 33.914269 },
    { latitude: 35.142166, longitude: 33.914083 },
    { latitude: 35.142317, longitude: 33.913947 },
    { latitude: 35.142565, longitude: 33.913992 },
    { latitude: 35.142691, longitude: 33.913983 },
    { latitude: 35.142787, longitude: 33.913932 },
    { latitude: 35.142789, longitude: 33.913806 },
    { latitude: 35.142886, longitude: 33.913722 },
    { latitude: 35.143162, longitude: 33.913485 },
    { latitude: 35.143263, longitude: 33.913499 },
    { latitude: 35.143626, longitude: 33.913178 },
    { latitude: 35.143816, longitude: 33.91301 },
    { latitude: 35.144105, longitude: 33.912694 },
    { latitude: 35.1448, longitude: 33.912065 },
    { latitude: 35.144803, longitude: 33.912059 },
    { latitude: 35.144803, longitude: 33.912051 },
    { latitude: 35.144729, longitude: 33.91158 },
    { latitude: 35.144729, longitude: 33.911568 },
    { latitude: 35.144736, longitude: 33.911557 },
    { latitude: 35.145129, longitude: 33.911199 },
    { latitude: 35.147107, longitude: 33.909222 },
    { latitude: 35.147117, longitude: 33.909216 },
    { latitude: 35.147129, longitude: 33.909216 },
    { latitude: 35.147694, longitude: 33.909386 },
    { latitude: 35.147709, longitude: 33.909386 },
    { latitude: 35.147722, longitude: 33.90938 },
    { latitude: 35.1486, longitude: 33.908576 },
    { latitude: 35.149399, longitude: 33.907999 },
    { latitude: 35.150705, longitude: 33.907086 },
    { latitude: 35.150349, longitude: 33.905443 },
    { latitude: 35.15198, longitude: 33.905451 },
    { latitude: 35.15202, longitude: 33.905185 },
    { latitude: 35.15188, longitude: 33.904476 },
    { latitude: 35.151781, longitude: 33.904512 },
    { latitude: 35.151528, longitude: 33.903412 },
  ],
  // ring 2 (7 points) — medical campus north
  [
    { latitude: 35.143547, longitude: 33.898583 },
    { latitude: 35.143031, longitude: 33.900434 },
    { latitude: 35.143464, longitude: 33.900473 },
    { latitude: 35.143771, longitude: 33.900501 },
    { latitude: 35.143892, longitude: 33.900092 },
    { latitude: 35.144253, longitude: 33.89887 },
    { latitude: 35.143547, longitude: 33.898583 },
  ],
  // ring 3 (26 points) — medical/health campus south
  [
    { latitude: 35.142622, longitude: 33.900016 },
    { latitude: 35.142375, longitude: 33.899923 },
    { latitude: 35.141912, longitude: 33.899729 },
    { latitude: 35.141562, longitude: 33.899584 },
    { latitude: 35.141212, longitude: 33.89944 },
    { latitude: 35.1408, longitude: 33.89927 },
    { latitude: 35.140746, longitude: 33.899245 },
    { latitude: 35.140379, longitude: 33.89908 },
    { latitude: 35.140189, longitude: 33.899758 },
    { latitude: 35.140152, longitude: 33.899892 },
    { latitude: 35.140312, longitude: 33.900178 },
    { latitude: 35.139775, longitude: 33.901115 },
    { latitude: 35.138799, longitude: 33.902825 },
    { latitude: 35.138576, longitude: 33.903492 },
    { latitude: 35.138366, longitude: 33.904156 },
    { latitude: 35.139257, longitude: 33.905587 },
    { latitude: 35.139736, longitude: 33.905763 },
    { latitude: 35.140423, longitude: 33.905238 },
    { latitude: 35.141189, longitude: 33.904625 },
    { latitude: 35.141296, longitude: 33.904501 },
    { latitude: 35.14138, longitude: 33.904377 },
    { latitude: 35.141442, longitude: 33.904253 },
    { latitude: 35.141503, longitude: 33.904088 },
    { latitude: 35.141663, longitude: 33.903459 },
    { latitude: 35.142145, longitude: 33.901706 },
    { latitude: 35.142622, longitude: 33.900016 },
  ],
];

/** Backwards-compatible alias for code that still needs a single ring. */
export const CAMPUS_POLYGON = CAMPUS_POLYGONS[0];

export type CampusPlaceKind =
  | 'faculty'
  | 'dorm'
  | 'library'
  | 'food'
  | 'sport'
  | 'admin'
  | 'health'
  | 'landmark';

export type CampusPlace = CampusPoint & {
  name: string;
  /** Short label used on the map at lower zoom. */
  short: string;
  kind: CampusPlaceKind;
  /** 1 = always visible; 2 = visible from zoom 16. */
  priority: 1 | 2;
};

/**
 * Named places on and around campus (OSM, ODbL). Coordinates are centroids of
 * the OSM building footprints. Used for map labels and to auto-name new bins.
 */
export const CAMPUS_PLACES: CampusPlace[] = [
  { name: 'Özay Oral Library', short: 'Library', latitude: 35.1414223, longitude: 33.9118816, kind: 'library', priority: 1 },
  { name: 'Central Lecture Halls', short: 'Lecture Halls', latitude: 35.1425001, longitude: 33.9108379, kind: 'faculty', priority: 1 },
  { name: 'Central Cafeteria', short: 'Cafeteria', latitude: 35.1443487, longitude: 33.9121854, kind: 'food', priority: 1 },
  { name: 'Lala Mustafa Pasha Sports Complex', short: 'Sports Complex', latitude: 35.1416071, longitude: 33.9080039, kind: 'sport', priority: 1 },
  { name: "Rector's Office", short: 'Rectorate', latitude: 35.1424144, longitude: 33.9089677, kind: 'admin', priority: 1 },
  { name: 'Administrative Services Building', short: 'Admin Services', latitude: 35.140265, longitude: 33.9138188, kind: 'admin', priority: 1 },
  { name: 'Faculty of Arts & Sciences', short: 'Arts & Sciences', latitude: 35.1433186, longitude: 33.9101996, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Architecture', short: 'Architecture', latitude: 35.1456828, longitude: 33.9097309, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Business & Economics', short: 'Business & Economics', latitude: 35.1418616, longitude: 33.9103931, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Engineering', short: 'Engineering', latitude: 35.1451, longitude: 33.9081, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Computer & Information Sciences', short: 'Computer Sciences', latitude: 35.1421523, longitude: 33.9129686, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Communication', short: 'Communication', latitude: 35.1391341, longitude: 33.9114376, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Law', short: 'Law', latitude: 35.1441006, longitude: 33.9091201, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Education', short: 'Education', latitude: 35.1403603, longitude: 33.9121263, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Medicine', short: 'Medicine', latitude: 35.1436863, longitude: 33.8994005, kind: 'health', priority: 1 },
  { name: 'Faculty of Dentistry', short: 'Dentistry', latitude: 35.1404154, longitude: 33.8995218, kind: 'health', priority: 1 },
  { name: 'Faculty of Health Sciences', short: 'Health Sciences', latitude: 35.14073, longitude: 33.90064, kind: 'health', priority: 2 },
  { name: 'Faculty of Pharmacy', short: 'Pharmacy', latitude: 35.1417203, longitude: 33.9008447, kind: 'health', priority: 2 },
  { name: 'School of Foreign Languages', short: 'Foreign Languages', latitude: 35.141075, longitude: 33.9034743, kind: 'faculty', priority: 1 },
  { name: 'Faculty of Tourism', short: 'Tourism', latitude: 35.1440117, longitude: 33.9114098, kind: 'faculty', priority: 2 },
  { name: 'Faculty of Fine Arts', short: 'Fine Arts', latitude: 35.1431223, longitude: 33.9117615, kind: 'faculty', priority: 2 },
  { name: 'Visual Arts & Communication Design', short: 'Visual Arts', latitude: 35.1435933, longitude: 33.9080799, kind: 'faculty', priority: 2 },
  { name: 'Architecture Studios', short: 'Arch Studios', latitude: 35.1445, longitude: 33.91036, kind: 'faculty', priority: 2 },
  { name: 'Institute of Graduate Studies', short: 'Graduate Studies', latitude: 35.1438828, longitude: 33.9110018, kind: 'faculty', priority: 2 },
  { name: 'IT Directorate', short: 'IT Directorate', latitude: 35.1434845, longitude: 33.9109194, kind: 'admin', priority: 2 },
  { name: 'Continuing Education Centre', short: 'Continuing Education', latitude: 35.1403808, longitude: 33.9100834, kind: 'faculty', priority: 2 },
  { name: 'Social & Cultural Activities', short: 'Social Activities', latitude: 35.1409092, longitude: 33.9128676, kind: 'landmark', priority: 2 },
  { name: 'Registrar\'s Office', short: 'Registrar', latitude: 35.1430498, longitude: 33.9089056, kind: 'admin', priority: 2 },
  { name: 'Accounting & Human Resources', short: 'Accounting & HR', latitude: 35.1430516, longitude: 33.9085514, kind: 'admin', priority: 2 },
  { name: "Table d'hote Restaurant", short: "Table d'hote", latitude: 35.1435255, longitude: 33.9092007, kind: 'food', priority: 2 },
  { name: 'Mechanical Engineering', short: 'Mechanical Eng.', latitude: 35.142852, longitude: 33.9123836, kind: 'faculty', priority: 2 },
  { name: 'Computer Engineering', short: 'Computer Eng.', latitude: 35.1460363, longitude: 33.908508, kind: 'faculty', priority: 2 },
  { name: 'Electrical & Electronic Engineering', short: 'Electrical Eng.', latitude: 35.1446652, longitude: 33.9077061, kind: 'faculty', priority: 2 },
  { name: 'Civil Engineering', short: 'Civil Eng.', latitude: 35.1448889, longitude: 33.9088646, kind: 'faculty', priority: 2 },
  { name: 'Industrial Engineering', short: 'Industrial Eng.', latitude: 35.145615, longitude: 33.9073063, kind: 'faculty', priority: 2 },
  { name: 'EMU 3 Dormitory', short: 'EMU 3 Dorm', latitude: 35.149, longitude: 33.9038, kind: 'dorm', priority: 1 },
  { name: 'EMU 4 Dormitory', short: 'EMU 4 Dorm', latitude: 35.1488471, longitude: 33.9032727, kind: 'dorm', priority: 2 },
  { name: 'DAÜ 2. Yurt', short: 'DAÜ 2 Dorm', latitude: 35.1484022, longitude: 33.9066605, kind: 'dorm', priority: 2 },
  { name: 'Alfam Dormitory', short: 'Alfam Dorm', latitude: 35.14725, longitude: 33.9072, kind: 'dorm', priority: 2 },
  { name: 'Marmara Dormitory', short: 'Marmara Dorm', latitude: 35.1481003, longitude: 33.9041926, kind: 'dorm', priority: 2 },
  { name: 'Sabancı Dormitory', short: 'Sabancı Dorm', latitude: 35.1396109, longitude: 33.9107492, kind: 'dorm', priority: 2 },
  { name: 'Pop Art Dormitory', short: 'Pop Art Dorm', latitude: 35.1393257, longitude: 33.9069061, kind: 'dorm', priority: 2 },
  { name: 'Astra Plus Dormitory', short: 'Astra Plus', latitude: 35.140506, longitude: 33.907125, kind: 'dorm', priority: 2 },
  { name: 'Golden Plus Dormitory', short: 'Golden Plus', latitude: 35.1400824, longitude: 33.9061693, kind: 'dorm', priority: 2 },
  { name: 'Novel Centre Point', short: 'Centre Point', latitude: 35.1405401, longitude: 33.9152815, kind: 'dorm', priority: 2 },
  { name: 'Halide Edip Guest House', short: 'Halide Edip', latitude: 35.1491937, longitude: 33.9050338, kind: 'landmark', priority: 2 },
  { name: 'Namık Kemal Guest House', short: 'Namık Kemal', latitude: 35.1494326, longitude: 33.9050153, kind: 'landmark', priority: 2 },
  { name: 'Student Dormitories Directorate', short: 'Dorm Directorate', latitude: 35.148014, longitude: 33.9071797, kind: 'admin', priority: 2 },
  { name: 'Technical Works', short: 'Technical Works', latitude: 35.1461733, longitude: 33.9060802, kind: 'admin', priority: 2 },
];

/**
 * Public contact links. Override with EXPO_PUBLIC_INSTAGRAM_URL /
 * EXPO_PUBLIC_WHATSAPP_URL in .env; the defaults point at EMU Sustainability
 * and the university support WhatsApp line.
 */
export const SOCIAL_LINKS = {
  instagram:
    process.env.EXPO_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/emu.sustainability/',
  whatsapp: process.env.EXPO_PUBLIC_WHATSAPP_URL ?? 'https://wa.me/905391060335',
};

/** Vertical space reserved for the floating mobile tab bar. */
export const BOTTOM_NAV_HEIGHT = 78;

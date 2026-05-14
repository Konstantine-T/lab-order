export const TEMPLATE_CODE_SG = 'SURGICAL_GUIDE';

export type SgGuideProtocol = 'PILOT' | 'FULL_PROTOCOL';
export type SgJaw = 'UPPER' | 'LOWER' | 'BOTH';
export type SgJawCondition = 'HAS_TEETH' | 'PARTIALLY_EDENTULOUS' | 'FULLY_EDENTULOUS';
export type SgGuideSupport =
  | 'TOOTH_SUPPORTED'
  | 'MUCOSA_SUPPORTED'
  | 'BONE_SUPPORTED'
  | 'STACKABLE'
  | 'CUSTOM';
export type SgAbutmentType = 'CEMENTED' | 'MULTI_UNIT' | 'LAB_DECIDES' | 'OTHER_CUSTOM';
export type SgAllOnProtocol = 'ALL_ON_4' | 'ALL_ON_5' | 'ALL_ON_6' | 'ALL_ON_8' | 'CUSTOM';
export type SgYesNoLab = 'YES' | 'NO' | 'LAB_DECIDES';
export type SgDentureSide = 'UPPER' | 'LOWER' | 'BOTH' | 'NONE';
export type SgProstheticSetup = 'DIGITAL' | 'PHYSICAL' | 'NONE' | 'LAB_DESIGN';

export type SgImplantDetail = {
  position: number;
  brand: string;
  system: string;
  diameter: string;
  length: string;
  notes: string;
};

export type SgJawData = {
  condition: SgJawCondition | '';
  allOnProtocol: SgAllOnProtocol | '';
  implantPositions: number[];
  guideSupport: SgGuideSupport | '';
  implantDetails: SgImplantDetail[];
  sameImplantSystem: boolean;
  // Edentulous-specific
  needsOcclusionGuide: SgYesNoLab | '';
  prostheticSetup: SgProstheticSetup | '';
  jawRelationTransfer: string;
  existingDenture: SgDentureSide | '';
  useExistingDentureRef: SgYesNoLab | '';
  planOnFutureProsthetics: SgYesNoLab | '';
};

export type SgAnswers = {
  guideProtocol: SgGuideProtocol | '';
  jaw: SgJaw | '';
  upper: SgJawData;
  lower: SgJawData;
  abutmentType: SgAbutmentType | '';
  directRestoration: 'YES' | 'NO' | '';
  tempShade: string;
  tempCustomShade: string;
  tempTeeth: number[];
  tempNotes: string;
};

export const UPPER_TEETH_SET = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
export const LOWER_TEETH_SET = new Set([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);

export const ALL_ON_PRESETS: Record<
  Exclude<SgAllOnProtocol, 'CUSTOM'>,
  { upper: number[]; lower: number[] }
> = {
  ALL_ON_4: { upper: [5, 6, 11, 12], lower: [21, 22, 27, 28] },
  ALL_ON_5: { upper: [4, 6, 8, 11, 13], lower: [19, 22, 24, 27, 30] },
  ALL_ON_6: { upper: [4, 6, 7, 10, 11, 13], lower: [19, 21, 24, 25, 28, 30] },
  ALL_ON_8: { upper: [3, 5, 6, 7, 10, 11, 12, 14], lower: [18, 20, 22, 24, 25, 27, 29, 31] },
};

export const SHADE_OPTIONS_SG: string[] = [
  'A1', 'A2', 'A3', 'A3.5', 'B1', 'B2', 'C1', 'C2', 'D2', 'D3', 'Bleach shade', 'Custom shade',
];

export const JAW_RELATION_OPTIONS: string[] = [
  'Bite registration scan',
  'Physical bite registration',
  'Existing denture scan',
  'Wax rim',
  'Photographs and clinical instructions',
  'Other',
];

export const SG_SUPPORT_TYPES: SgGuideSupport[] = [
  'TOOTH_SUPPORTED',
  'MUCOSA_SUPPORTED',
  'BONE_SUPPORTED',
  'STACKABLE',
  'CUSTOM',
];

export const emptySgJawData: SgJawData = {
  condition: '',
  allOnProtocol: '',
  implantPositions: [],
  guideSupport: '',
  implantDetails: [],
  sameImplantSystem: true,
  needsOcclusionGuide: '',
  prostheticSetup: '',
  jawRelationTransfer: '',
  existingDenture: '',
  useExistingDentureRef: '',
  planOnFutureProsthetics: '',
};

export const emptySgAnswers: SgAnswers = {
  guideProtocol: '',
  jaw: '',
  upper: { ...emptySgJawData },
  lower: { ...emptySgJawData },
  abutmentType: '',
  directRestoration: '',
  tempShade: '',
  tempCustomShade: '',
  tempTeeth: [],
  tempNotes: '',
};

export function syncImplantDetails(
  positions: number[],
  existing: SgImplantDetail[],
): SgImplantDetail[] {
  const existingMap = new Map(existing.map((d) => [d.position, d]));
  return positions.map(
    (pos) =>
      existingMap.get(pos) ?? {
        position: pos,
        brand: '',
        system: '',
        diameter: '',
        length: '',
        notes: '',
      },
  );
}

export function coerceSgAnswers(raw: unknown): SgAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const coerceJaw = (obj: unknown): SgJawData => {
    const j = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
    return {
      condition: (typeof j.condition === 'string' ? j.condition : '') as SgJawCondition | '',
      allOnProtocol: (typeof j.allOnProtocol === 'string'
        ? j.allOnProtocol
        : '') as SgAllOnProtocol | '',
      implantPositions: Array.isArray(j.implantPositions)
        ? (j.implantPositions as unknown[]).filter(
            (n): n is number => typeof n === 'number' && n >= 1 && n <= 32,
          )
        : [],
      guideSupport: (typeof j.guideSupport === 'string'
        ? j.guideSupport
        : '') as SgGuideSupport | '',
      implantDetails: Array.isArray(j.implantDetails)
        ? (j.implantDetails as SgImplantDetail[])
        : [],
      sameImplantSystem:
        typeof j.sameImplantSystem === 'boolean' ? j.sameImplantSystem : true,
      needsOcclusionGuide: (typeof j.needsOcclusionGuide === 'string'
        ? j.needsOcclusionGuide
        : '') as SgYesNoLab | '',
      prostheticSetup: (typeof j.prostheticSetup === 'string'
        ? j.prostheticSetup
        : '') as SgProstheticSetup | '',
      jawRelationTransfer:
        typeof j.jawRelationTransfer === 'string' ? j.jawRelationTransfer : '',
      existingDenture: (typeof j.existingDenture === 'string'
        ? j.existingDenture
        : '') as SgDentureSide | '',
      useExistingDentureRef: (typeof j.useExistingDentureRef === 'string'
        ? j.useExistingDentureRef
        : '') as SgYesNoLab | '',
      planOnFutureProsthetics: (typeof j.planOnFutureProsthetics === 'string'
        ? j.planOnFutureProsthetics
        : '') as SgYesNoLab | '',
    };
  };

  return {
    guideProtocol: (typeof r.guideProtocol === 'string'
      ? r.guideProtocol
      : '') as SgGuideProtocol | '',
    jaw: (typeof r.jaw === 'string' ? r.jaw : '') as SgJaw | '',
    upper: coerceJaw(r.upper),
    lower: coerceJaw(r.lower),
    abutmentType: (typeof r.abutmentType === 'string'
      ? r.abutmentType
      : '') as SgAbutmentType | '',
    directRestoration: (typeof r.directRestoration === 'string'
      ? r.directRestoration
      : '') as 'YES' | 'NO' | '',
    tempShade: typeof r.tempShade === 'string' ? r.tempShade : '',
    tempCustomShade: typeof r.tempCustomShade === 'string' ? r.tempCustomShade : '',
    tempTeeth: Array.isArray(r.tempTeeth)
      ? (r.tempTeeth as unknown[]).filter(
          (n): n is number => typeof n === 'number' && n >= 1 && n <= 32,
        )
      : [],
    tempNotes: typeof r.tempNotes === 'string' ? r.tempNotes : '',
  };
}

export type SgErrors = Partial<{
  guideProtocol: string;
  jaw: string;
  upperCondition: string;
  lowerCondition: string;
  upperPositions: string;
  lowerPositions: string;
  upperGuideSupport: string;
  lowerGuideSupport: string;
  abutmentType: string;
}>;

export function validateSg(a: SgAnswers): SgErrors {
  const e: SgErrors = {};
  const req = 'Please fill out the required fields.';
  const noPos = 'Select at least one implant position.';

  if (!a.guideProtocol) e.guideProtocol = req;
  if (!a.jaw) e.jaw = req;

  const hasUpper = a.jaw === 'UPPER' || a.jaw === 'BOTH';
  const hasLower = a.jaw === 'LOWER' || a.jaw === 'BOTH';

  if (hasUpper) {
    if (!a.upper.condition) e.upperCondition = req;
    if (!a.upper.implantPositions.length) e.upperPositions = noPos;
    if (!a.upper.guideSupport) e.upperGuideSupport = req;
  }
  if (hasLower) {
    if (!a.lower.condition) e.lowerCondition = req;
    if (!a.lower.implantPositions.length) e.lowerPositions = noPos;
    if (!a.lower.guideSupport) e.lowerGuideSupport = req;
  }
  if (!a.abutmentType) e.abutmentType = req;

  return e;
}

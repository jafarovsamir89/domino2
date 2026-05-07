export declare function normalizeLegacyName(value: unknown): string;
export declare function makeLegacyAliasEmail(value: unknown, fallbackName?: string): string;
export declare function encodeLegacyPassword(password: unknown, salt?: string): string;
export declare function encodeLegacyPasswordFromParts(salt: unknown, hash: unknown): string;
export declare function isLegacyPasswordHash(hash: unknown): boolean;
export declare function verifyLegacyPassword(hash: unknown, password: unknown): boolean;

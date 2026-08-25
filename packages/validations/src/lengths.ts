export const NAME_LENGTH = { min: 2, max: 80 } as const;
export const EMAIL_LENGTH = { min: 3, max: 254 } as const;
export const PASSWORD_LENGTH = { min: 8, max: 128 } as const;
export const TITLE_LENGTH = { min: 3, max: 160 } as const;
export const DESCRIPTION_LENGTH = { min: 1, max: 2_000 } as const;
export const TRANSCRIPT_LENGTH = { max: 20_000 } as const;

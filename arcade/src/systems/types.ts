export interface Platform {
  id: string;
  name: string;
  short: string;
  manufacturer: string;
  year: number;
  media: string;
  arcade: boolean;
  emulate: boolean;
  emulateEnabled: boolean;
  identify: boolean;
  catalog: boolean;
}

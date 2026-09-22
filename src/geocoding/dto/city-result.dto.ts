export interface CityResult {
  id: string;
  name: string;
  fullName: string;
  countryCode: string | null;
}

export interface CitiesResponse {
  results: CityResult[];
}

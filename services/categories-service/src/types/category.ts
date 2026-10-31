// `custom`: true for one the user added themselves, false for a shared
// default (docs/adr/0015).
export interface Subcategory {
  id: string;
  name: string;
  custom: boolean;
}

export interface Category {
  id: string;
  name: string;
  custom: boolean;
  subcategories: Subcategory[];
}

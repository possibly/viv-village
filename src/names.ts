import { random } from './random';

export const MALE_NAMES = [
  'Aldric', 'Bertram', 'Cedric', 'Dunstan', 'Edmund', 'Fulke', 'Godwin',
  'Harold', 'Ingram', 'Joscelin', 'Kenelm', 'Leofric', 'Mauger', 'Nigel',
  'Osbert', 'Piers', 'Quentin', 'Randolph', 'Sigurd', 'Thurstan', 'Ulric',
  'Vivian', 'Wulfric', 'Aylmer', 'Baldwin', 'Cuthbert', 'Drogo', 'Elias',
  'Gilbert', 'Hamo', 'Ivo', 'Jordan', 'Lambert', 'Martin', 'Nicholas',
  'Oswin', 'Philip', 'Ralph', 'Simon', 'Thomas', 'Walter', 'William',
];

export const FEMALE_NAMES = [
  'Aelswith', 'Beatrice', 'Cecily', 'Dorothea', 'Edith', 'Freya', 'Gunhild',
  'Hilde', 'Isolde', 'Joan', 'Katerina', 'Lettice', 'Matilda', 'Nest',
  'Osanna', 'Petronilla', 'Rohese', 'Sybil', 'Thomasine', 'Ursula', 'Wulfrun',
  'Agnes', 'Avice', 'Basilia', 'Constance', 'Denise', 'Emmeline', 'Felicia',
  'Gunnora', 'Hawise', 'Ida', 'Juliana', 'Lecia', 'Margery', 'Nichola',
  'Olive', 'Philippa', 'Ricarda', 'Sabina', 'Tiffany', 'Ymma',
];

export const SURNAMES = [
  'Fletcher', 'Cooper', 'Thatcher', 'Miller', 'Baker', 'Smith', 'Carter',
  'Ward', 'Hunt', 'Turner', 'Fisher', 'Weaver', 'Mason', 'Tanner', 'Shepherd',
  'Plowman', 'Fuller', 'Dyer', 'Chandler', 'Fowler', 'Harper', 'Sawyer',
  'Brewer', 'Collier', 'Draper', 'Forester', 'Granger', 'Hayward', 'Inman',
  'Kemp', 'Lander', 'Mercer', 'Porter', 'Reeve', 'Salter', 'Wainwright',
];

export function randomName(gender: 'male' | 'female'): string {
  const first = gender === 'male' ? MALE_NAMES : FEMALE_NAMES;
  const f = first[Math.floor(random() * first.length)];
  const s = SURNAMES[Math.floor(random() * SURNAMES.length)];
  return `${f} ${s}`;
}

// Marcas que se venden en el puesto. Cada una pesa con su propia balanza, por
// eso sus tickets no se parecen entre sí (ver src/lib/tickets/parser.ts).

import { ruta } from './rutas';

export interface Marca {
	id: string;
	nombre: string;
	logo: string;
}

export const MARCAS: Marca[] = [
	{ id: 'huella-pampa', nombre: 'Huella Pampa', logo: ruta('img/huella-pampa.jpg') },
	{ id: 'oliverio', nombre: 'Oliverio', logo: ruta('img/oliverio.jpg') },
	{ id: 'mama-mecha', nombre: 'Mamá Mecha', logo: ruta('img/mama-mecha.jpg') },
	{ id: 'milkey', nombre: 'Milkey', logo: ruta('img/milkey.png') },
];

export function marcaPorId(id: string | null | undefined): Marca | undefined {
	return MARCAS.find((m) => m.id === id);
}

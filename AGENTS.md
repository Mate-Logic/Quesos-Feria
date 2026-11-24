## Reglas para agentes

Estas reglas son obligatorias para cualquier agente (Claude Code, Codex, Copilot, Cursor, etc.) que trabaje en este repositorio.

### 1. Commits: Conventional Commits en español

Todos los commits siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), con la descripción y el cuerpo escritos en español.

Formato:

```
<tipo>(<ámbito opcional>): <descripción>

[cuerpo opcional]

[pie(s) opcional(es)]
```

- **Tipos permitidos** (se escriben en inglés, como define el estándar): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Descripción**: en español, en modo imperativo ("agrega", "corrige", no "agregado" ni "agregando"), en minúscula, sin punto final y de 72 caracteres como máximo.
- **Ámbito**: opcional, en minúscula, e indica la parte afectada (por ejemplo `home`, `catalogo`, `estilos`, `deps`).
- **Cuerpo**: opcional; explica el *qué* y el *por qué*, no el *cómo*.
- **Cambios incompatibles**: se marcan con `!` después del tipo o ámbito (`feat!: ...`) o con un pie `BREAKING CHANGE: <explicación>`.
- Un commit corresponde a un solo cambio lógico. No se mezclan tipos distintos en el mismo commit.

Ejemplos:

```
feat(catalogo): agrega listado de quesos con precios
fix(home): corrige el desborde del menú en móviles
docs: documenta los pasos para levantar el proyecto
build(deps): actualiza astro a la versión 5.2
refactor(estilos)!: reemplaza variables CSS por tokens de Tailwind

BREAKING CHANGE: los componentes que usaban --color-primario deben migrar a las clases de Tailwind.
```

### 2. Uso obligatorio de Context7

Antes de escribir, modificar o revisar código que dependa de una librería, framework, API o herramienta de línea de comandos (Astro, Tailwind, TypeScript, integraciones, bun, etc.), es **obligatorio** consultar su documentación actualizada en [Context7](https://context7.com/).

- No se debe depender de lo que el agente recuerde, porque las APIs cambian entre versiones.
- Si el agente tiene el servidor MCP de Context7, primero resuelve el ID de la librería (`resolve-library-id`) y después consulta la documentación (`query-docs`) con una pregunta concreta.
- Si no tiene el MCP, consulta la librería directamente en https://context7.com/.
- Se debe tener en cuenta la versión instalada del proyecto (ver `package.json` y `bun.lock`).
- Solo si Context7 no tiene la librería o la información necesaria se recurre a la documentación oficial (ver la sección *Documentation* más abajo), y se debe dejar indicado.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

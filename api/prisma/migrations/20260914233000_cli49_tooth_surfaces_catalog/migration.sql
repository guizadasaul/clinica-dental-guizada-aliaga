-- CLI-49: las superficies dentales eran 5 columnas booleanas paralelas en
-- tooth_procedures (violación de 1FN: son un conjunto, no cinco atributos
-- distintos) y no existían incisal ni lingual, así que una restauración en
-- el borde incisal de un incisivo o una superficie lingual en un molar
-- inferior no se podía registrar correctamente. Se reemplazan por un
-- catálogo (tooth_surfaces) + tabla puente (tooth_procedure_surfaces).

-- 1. Catálogo de superficies (fijo por la anatomía dental).
CREATE TABLE "tooth_surfaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "display_order" INTEGER NOT NULL,
    CONSTRAINT "tooth_surfaces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tooth_surfaces_code_key" ON "tooth_surfaces"("code");

INSERT INTO "tooth_surfaces" ("code", "name", "display_order") VALUES
    ('vestibular', 'Vestibular', 1),
    ('palatal',    'Palatal',    2),
    ('lingual',    'Lingual',    3),
    ('mesial',     'Mesial',     4),
    ('distal',     'Distal',     5),
    ('occlusal',   'Oclusal',    6),
    ('incisal',    'Incisal',    7);

-- 2. Tabla puente: qué superficies tiene marcadas cada procedimiento.
CREATE TABLE "tooth_procedure_surfaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tooth_procedure_id" UUID NOT NULL,
    "tooth_surface_id" UUID NOT NULL,
    CONSTRAINT "tooth_procedure_surfaces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idx_tooth_procedure_surfaces_unique" ON "tooth_procedure_surfaces"("tooth_procedure_id", "tooth_surface_id");
CREATE INDEX "idx_tooth_procedure_surfaces_procedure" ON "tooth_procedure_surfaces"("tooth_procedure_id");

ALTER TABLE "tooth_procedure_surfaces" ADD CONSTRAINT "tooth_procedure_surfaces_tooth_procedure_id_fkey" FOREIGN KEY ("tooth_procedure_id") REFERENCES "tooth_procedures"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "tooth_procedure_surfaces" ADD CONSTRAINT "tooth_procedure_surfaces_tooth_surface_id_fkey" FOREIGN KEY ("tooth_surface_id") REFERENCES "tooth_surfaces"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- 3. Backfill: migrar los 5 booleanos existentes a filas de la tabla puente.
INSERT INTO "tooth_procedure_surfaces" ("tooth_procedure_id", "tooth_surface_id")
SELECT tp."id", ts."id" FROM "tooth_procedures" tp, "tooth_surfaces" ts
WHERE ts."code" = 'vestibular' AND tp."surface_vestibular" = true;

INSERT INTO "tooth_procedure_surfaces" ("tooth_procedure_id", "tooth_surface_id")
SELECT tp."id", ts."id" FROM "tooth_procedures" tp, "tooth_surfaces" ts
WHERE ts."code" = 'palatal' AND tp."surface_palatal" = true;

INSERT INTO "tooth_procedure_surfaces" ("tooth_procedure_id", "tooth_surface_id")
SELECT tp."id", ts."id" FROM "tooth_procedures" tp, "tooth_surfaces" ts
WHERE ts."code" = 'mesial' AND tp."surface_mesial" = true;

INSERT INTO "tooth_procedure_surfaces" ("tooth_procedure_id", "tooth_surface_id")
SELECT tp."id", ts."id" FROM "tooth_procedures" tp, "tooth_surfaces" ts
WHERE ts."code" = 'distal' AND tp."surface_distal" = true;

INSERT INTO "tooth_procedure_surfaces" ("tooth_procedure_id", "tooth_surface_id")
SELECT tp."id", ts."id" FROM "tooth_procedures" tp, "tooth_surfaces" ts
WHERE ts."code" = 'occlusal' AND tp."surface_occlusal" = true;

-- 4. Ya migrados, se eliminan las columnas booleanas paralelas.
ALTER TABLE "tooth_procedures" DROP COLUMN "surface_vestibular";
ALTER TABLE "tooth_procedures" DROP COLUMN "surface_palatal";
ALTER TABLE "tooth_procedures" DROP COLUMN "surface_mesial";
ALTER TABLE "tooth_procedures" DROP COLUMN "surface_distal";
ALTER TABLE "tooth_procedures" DROP COLUMN "surface_occlusal";

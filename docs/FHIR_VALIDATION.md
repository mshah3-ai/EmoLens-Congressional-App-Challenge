# Checking an EmoLens FHIR file with the official validator (optional)

EmoLens can export a child's data as a **FHIR R4** file (More → Reports & export → "Health record file (FHIR)"). FHIR is
the standard format health-record systems use to exchange data (SPEC 22.4). Automated tests already check the file's
structure (`apps/mobile/test/reports.test.ts`). The official HL7 validator is a second, stricter check. It is optional
and needs Java.

## Steps
1. Install Java 17 or newer (https://adoptium.net, choose "Temurin 21 LTS" for macOS). Check it: `java -version`.
2. Download the validator: https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar
3. Make a sample file: in the app, open demo mode → More → Reports & export → "Health record file (FHIR)" → save it to
   Files (or AirDrop it to the Mac). The file is called `emolens-fhir-YYYY-MM-DD.json`.
4. Run, in the folder with both files:
   ```
   java -jar validator_cli.jar emolens-fhir-2026-09-30.json -version 4.0.1
   ```
   The first run downloads the FHIR R4 definitions (a few minutes).

## What to expect
- **No errors** is the goal. Please paste any "Error" lines to me.
- **Warnings or information about `https://emolens.app/fhir/CodeSystem/emolens`** are expected: that is EmoLens's own
  code system for "distress episode", "episode type", "intensity" and "setting". It isn't published anywhere, so the
  validator can't look it up. Other systems still read the file; they just show the text EmoLens puts next to each code.
- The sleep code (LOINC 93832-4 "Sleep duration", hours in UCUM `h`) and RxNorm medication codes should validate.

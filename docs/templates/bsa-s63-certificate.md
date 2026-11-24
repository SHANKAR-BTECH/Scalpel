# Certificate under section 63(4), Bharatiya Sakshya Adhiniyam, 2023 (template)

> **Status: draft template for the simulation. Not legal advice.**
> Before any real use, compare it line by line with the Schedule to the Bharatiya Sakshya Adhiniyam, 2023
> (Part A by the party, Part B by an expert) and have it checked by the bank's legal team.
> Fields in `<angle brackets>` are filled from the Scalpel evidence pack.

## Part A: to be filled by the party producing the electronic record

I, `<name>`, `<designation>`, `<bank and branch>`, state as follows:

1. The electronic record attached is the Scalpel evidence pack for case `<case id>`, account `<masked account number>`,
   covering `<first event date>` to `<last event date>`.
2. It was produced by the computer system `<system name and version>`, policy pack `<policy id>`, code commit `<commit>`,
   which was in regular use by `<bank>` to record holds on accounts linked to cyber-fraud complaints.
3. During that period the system was operating properly. `<Describe any outage or error, or write "None".>`
4. The information in the record was fed into the system in the ordinary course of business:
   complaints from NCRP/CFCFRMS, police requests, bank transaction data and officer decisions.
5. The record's hash values are:
   - SHA-256 of the evidence pack file: `<sha256>`
   - Case fingerprint (Merkle root of the audit chain): `<merkle root>`
   - Number of audit entries: `<n>`
6. Anyone can recompute these values on the `/verify` page, or with any SHA-256 tool, and compare them with this certificate.
   The chain is tamper-evident: a change to any entry changes the fingerprint.

Signed: `<signature>`  Name: `<name>`  Designation: `<designation>`  Date and time: `<IST timestamp>`  Place: `<place>`

## Part B: to be filled by an expert

I, `<name of expert>`, `<qualification>`, have examined the electronic record described in Part A.

1. I recomputed the SHA-256 value and the case fingerprint and they match the values in Part A: `<yes / no, with details>`.
2. Method and tool used: `<tool and version>`.
3. `<Any further observation.>`

Signed: `<signature>`  Name: `<name>`  Designation: `<designation>`  Date and time: `<IST timestamp>`

# China Clinical Trials

**A searchable database of every clinical trial on ClinicalTrials.gov that runs in mainland China or is sponsored by a Chinese organisation.**

### → **[Open the site](https://chenru1z.github.io/china-clinical-trials/)**

---

| | |
|---|---|
| **63,735** | trials in scope |
| **54,064** | with at least one site in mainland China |
| **9,671** | Chinese-sponsored but run entirely outside China |
| **16,303** | industry-led |
| **11,958** | currently recruiting |
| **2,623** | with posted results |

Derived from the ClinicalTrials.gov bulk download, snapshot **2026-09-25**.

---

## What it does

- **Dashboard** — registration growth since 2005, industry vs. academic split, phase and status distribution, most active provinces and cities, largest sponsors, most-studied conditions, international partners.
- **Search** — full-text across titles, conditions, interventions and sponsors, with filters for phase, status, sponsor, sponsor type, province, condition and start year.
- **Trial pages** — design, eligibility, outcome measures, every site, collaborators, MeSH terms and linked publications, with a link back to the ClinicalTrials.gov record.

No account, no tracking, no backend. The whole thing is static files.

---

## How "Chinese" is decided

This is the part that isn't obvious, and it is where most of the work went.

**ClinicalTrials.gov records no country for sponsors.** Site locations are structured data; sponsor nationality is not stored at all. Filtering on `country == "China"` returns 54,064 trials and silently misses every Chinese company running studies abroad — precisely the population that matters if the question is "what is Chinese pharma doing?"

So a trial qualifies on either of two independent signals:

**1. Geography** — at least one trial site in mainland China.

**2. Sponsor nationality**, inferred two ways:

- **Name recognition** against a curated list of ~150 Chinese pharmaceutical, biotech, vaccine, CRO and academic organisations, plus matching on Chinese cities, provinces and flagship institutions.
- **Portfolio geography** — for each of the 52,150 distinct lead sponsors in the registry, what fraction of its located trials run *exclusively* in mainland China. At ≥70% over ≥3 trials, the sponsor is treated as Chinese.

Portfolio geography catches companies whose names give nothing away — Bio-Thera Solutions, Chipscreen Biosciences, Ascletis, Jemincare, Vigonvita. Name recognition catches the opposite case: BeiGene runs only 31% of its trials in China alone, so geography alone would reject it.

Every trial records which rule admitted it, shown on its detail page as *"Why this trial is in scope"*.

### Hong Kong, Macau and Taiwan are excluded

They operate under separate regulators — HK DoH, Macau SSM, Taiwan TFDA, not the NMPA. Keeping them out took three guards, because name matching leaks badly here:

1. An explicit non-mainland name list. *"Chinese University of Hong Kong"* matches the word "Chinese" and by itself pulled in 1,178 Hong-Kong-only trials.
2. A portfolio override. *"China Medical University Hospital"* is in Taichung, Taiwan — 422 trials, none in the mainland — and matches the token "china". A blocklist is the wrong tool, because **China Medical University in Shenyang is genuinely mainland**: the names cannot be separated, only the geography can. So a heuristic token match is overruled when a sponsor has ≥10 located trials, ≥50% of them in Taiwan/HK/Macau, and <10% touching the mainland. Requiring positive evidence of the *other* region — rather than mere absence of China — protects Chinese firms that run trials abroad.
3. That override binds every rule. A name rejected as lead sponsor must also be rejected as submitting organisation and as collaborator, or the trials walk back in through the side door.

Trials with Taiwan/HK sites but no mainland site fell from 1,428 to 83 (0.13%), and most of the remainder are legitimate — mainland companies such as TransThera (Nanjing), Chengdu Kanghong and Zai Lab running regional studies. Sites in these regions still appear normally on trials that also run in the mainland.

---

## Limitations

- **ClinicalTrials.gov is a US registry.** Trials registered only on the Chinese registry (ChiCTR) are absent, so this undercounts Chinese clinical activity. There is no comparable ChiCTR bulk export.
- **Sponsor inference is a heuristic, not ground truth.** A Chinese subsidiary of a multinational may land on either side of the line.
- **Registration is self-reported.** "Recruiting" can be years stale; about 20,600 trials carry an unknown status.
- **Only 4.1% of trials have posted results** — normal for the registry, but it limits outcomes analysis.
- **2026 is a partial year** in every chart and count.
- The search index covers titles, conditions, interventions and sponsors, **not** trial summaries — including them would multiply the page load fourfold. Summaries are shown in full on each trial page.

---

## How it is built

A three-pass Python pipeline over the 2.75 GB bulk download (604,566 studies, 10.5 GB uncompressed):

1. **Index every study** — not just the Chinese ones. Deciding whether a sponsor is Chinese requires seeing the trials it runs *elsewhere*.
2. **Classify sponsors and select trials.**
3. **Build a SQLite database** of the selected trials — 9 normalised tables plus an FTS5 index, 570,201 site records.

A fourth pass exports it to static JSON. The search index is column-oriented and dictionary-encoded — no repeated JSON keys, and every low-cardinality field is an integer index into a shared dictionary — which fits 63,735 trials into **3.3 MB gzipped**. It downloads once; after that, search and filtering run entirely in the browser. Trial pages fetch one 134 KB shard out of 1,000.

Python standard library only. No frameworks, no build step, no dependencies.

A companion script pulls incremental updates from the ClinicalTrials.gov API v2 using `LastUpdatePostDate`, so the snapshot can be refreshed without re-downloading the archive.

---

## Attribution

Data courtesy of the **U.S. National Library of Medicine**, from [ClinicalTrials.gov](https://clinicaltrials.gov). ClinicalTrials.gov data is in the public domain.

**NLM does not endorse or verify this site.** This is an independent project and is not affiliated with the NLM, the NIH, or any sponsor listed in the data.

Nothing here is medical advice. To find a trial to participate in, consult ClinicalTrials.gov and a qualified clinician.

---

## Accuracy

If you find a trial that is wrongly included or wrongly missing, please [open an issue](../../issues) with the NCT ID — misclassifications are useful and the rules above can be tightened.

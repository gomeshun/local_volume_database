# **local_volume_database** 

## Fork notice (web app)

This repository is a fork of the upstream LVDB project: https://github.com/apace7/local_volume_database

- The `web/` directory contains an **unofficial** web UI (Next.js) intended to make it easier to browse LVDB tables.
- This fork is **not affiliated with or endorsed by** the upstream LVDB maintainers.

For the web UI, you can optionally set fork-specific links (repo/site/issues) via environment variables; see `web/.env.example`.

### License / reuse

Upstream (and this fork) includes a **CC0 1.0 Universal** dedication (see `LICENSE`). In practical terms, this permits reuse, modification, and redistribution (including public web deployment). While CC0 does not require attribution, this fork keeps explicit credit links to the upstream project and encourages following the upstream paper citation guidance.

### Issues

- LVDB data/content issues: upstream LVDB project
- Web UI issues: this fork's issue tracker

## Web app (in this repo)

We are building a researcher-friendly web application under `web/` (Next.js) and publishing it on GitHub Pages.

### Roadmap memo (incremental)

1. Start by displaying the database content as-is (tables/lists/details from the CSV/YAML included in this repo)
2. Add graphical sky visualization using the Aladin Lite API (RA/Dec)
3. Gradually integrate SIMBAD / NED / VizieR to fetch richer info (object position, member-star catalogs, etc.)

### Local dev

Run from `web/`:

    npm install
    npm run dev

### GitHub Pages deploy

Pushing to `main` triggers a GitHub Actions workflow that builds a static export and deploys it to Pages: `.github/workflows/deploy.yml`.

### DESCRIPTION:

The LVDB is a database of dwarf galaxies and star clusters in the Local Volume. The database is complete for dwarf galaxies within ~5 Mpc. 
The planned limiting distance is ~10+ Mpc (i.e. resolved stars with HST or JWST).  
The star cluster collections are currently limited to old star clusters/globular clusters in the Milky Way halo and globular clusters/star clusters hosted by low-mass dwarf galaxies.

The main data tables are located in the [`GitHub release pages`](https://github.com/apace7/local_volume_database/releases/) in `CSV` and `FITS` file formats. This includes a combined catalog file of the entire database (comb_all.csv) and a summary pdf document of the database content. 



Documentation: [readthedocs](https://local-volume-database.readthedocs.io/en/latest/index.html).

Overview paper: [arXiv](https://arxiv.org/abs/2411.07424) and  [ADS](https://ui.adsabs.harvard.edu/abs/2025OJAp....8E.142P/abstract).

The LVDB releases are also indexed on [Zenodo](https://doi.org/10.5281/zenodo.14076714).

The catalog can be directly loaded into Jupyter notebooks without having to download the repository:

    import astropy.table as table
    # loads the current catalog from the release page (recommended)
    version_number_string = table.Table.read('https://raw.githubusercontent.com/apace7/local_volume_database/main/code/release_version.txt', format='ascii.fast_no_header')['col1'][0]
    comb_all = table.Table.read('https://github.com/apace7/local_volume_database/releases/download/'+version_number_string+'/comb_all.csv')


An interactive version of the LVDB is available here: [link](https://lvd-interactive.streamlit.app/) (made by Katya Gozman).

Community contributions to the LVDB are welcome. Please feel free to contract me with any questions about LVDB content and/or potential contributions. 

### INSTALLATION and USE:

Users that only want to use the catalogs do not need to install the package. 
The catalogs are available as csv and fits files in the release pages.
The package is focused on helper functions and yaml file access. 


The package is installable locally via pip:

```
git clone https://github.com/apace7/local_volume_database.git
cd local_volume_database
python -m build
pip install .
```

The `LVDBDIR` environment variable is required to point to the location of the input YAML files (/data_input/). 

### ACKNOWLEDGEMENT:

If you use this in your research please cite the overview paper and include a link to the github repository (https://github.com/apace7/local_volume_database). It is highly encouraged to cite the input references of the database if they are used in your work. An example acknowledgement in LaTeX (with BibTeX below): This work has made use of the Local Volume Database\footnote{\url{https://github.com/apace7/local_volume_database}} \citep{Pace2025OJAp....8E.142P}. 

The BibTeX of the citation is available below and on [ADS](https://ui.adsabs.harvard.edu/abs/2025OJAp....8E.142P/exportcitation):

    @ARTICLE{Pace2025OJAp....8E.142P,
        author = {{Pace}, Andrew B},
            title = "{The Local Volume Database: a library of the observed properties of nearby dwarf galaxies and star clusters}",
        journal = {The Open Journal of Astrophysics},
        keywords = {Astrophysics of Galaxies},
            year = 2025,
            month = sep,
        volume = {8},
            eid = {142},
            pages = {142},
            doi = {10.33232/001c.144859},
        archivePrefix = {arXiv},
        eprint = {2411.07424},
        primaryClass = {astro-ph.GA},
        adsurl = {https://ui.adsabs.harvard.edu/abs/2025OJAp....8E.142P},
        adsnote = {Provided by the SAO/NASA Astrophysics Data System}
    }




# Elmanagil Climate & Flood Risk Analysis

Two self-directed Google Earth Engine (JavaScript) projects over Elmanagil, Sudan (Gezira agricultural scheme, Eastern Nile sub-basin), prepared in support of an application to ENTRO's Regional Climate Resilience Program (RCRP) Internship on Climate Data and Forecasting for Hydrological Analysis.

## 1. Rainfall Products Comparison
**File:** `rainfall_analysis.js`

Compares CHIRPS, GPM IMERG, and ERA5-Land rainfall over Elmanagil (2001-2023): monthly climatology, seasonal (JJAS) trends, product-to-product agreement (bias, RMSE, correlation), and bias correction of the weakest product using monthly quantile mapping. Key result: GPM IMERG agrees most closely with CHIRPS (r = 0.94); bias correction improved ERA5-Land accuracy by ~24.5%.

## 2. Flood Susceptibility Mapping
**File:** `flood_susceptibility_mapping.js`

Produces a screening-level flood susceptibility map for Elmanagil using a weighted overlay of terrain and drainage indicators (HAND and flow accumulation from MERIT Hydro, slope from SRTM), seasonal rainfall (CHIRPS), and land cover (ESA WorldCover) - used in place of unavailable local irrigation-canal data.

## How to run
1. Open Google Earth Engine Code Editor (code.earthengine.google.com).
2. Import your own study area boundary as an asset named `table`.
3. Paste the script and click Run.
4. Run the export tasks manually from the Tasks tab to save results to Google Drive.

## Why this project
Carried out independently, before the internship, to deepen practical skills in climate and hydrological data analysis and to demonstrate openness to learning new tools relevant to the RCRP internship tasks.
   ## Technical Reports
   - [Rainfall Comparison Report](./rainfall_technical_report.pdf)
   - [Flood Susceptibility Report](./flood_susceptibility_technical_report.pdf)

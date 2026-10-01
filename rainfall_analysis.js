
// ------------------------------------------------------------
// 1) Study area and time period
// ------------------------------------------------------------
var studyArea = table.geometry();

Map.centerObject(studyArea, 9);
Map.addLayer(studyArea, {color: 'red'}, 'Elmanagil boundary');

var startYear = 2001;
var endYear   = 2023;
var scale     = 5000; // extraction resolution in meters

// ------------------------------------------------------------
// 2) Generic function: monthly basin-mean series for any product
// ------------------------------------------------------------
function monthlySeries(collection, band, factor, label) {
  var months = ee.List.sequence(0, (endYear - startYear + 1) * 12 - 1);

  var series = ee.FeatureCollection(months.map(function (i) {
    var start = ee.Date.fromYMD(startYear, 1, 1).advance(i, 'month');
    var end   = start.advance(1, 'month');

    var img = collection
      .filterDate(start, end)
      .select(band)
      .sum()
      .multiply(factor)
      .rename('precip_mm');

    var meanVal = img.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: studyArea,
      scale: scale,
      maxPixels: 1e9
    }).get('precip_mm');

    return ee.Feature(null, {
      'date': start.format('YYYY-MM'),
      'year': start.get('year'),
      'month': start.get('month'),
      'precip_mm': meanVal,
      'source': label
    });
  }));

  return series;
}

// ------------------------------------------------------------
// 3) Extract the three monthly series
//    Note: verify band names and units in the GEE Data Catalog,
//    since they can change between dataset versions.
// ------------------------------------------------------------

// CHIRPS: native unit is mm/day -> summed monthly, no extra conversion
var chirps = monthlySeries(
  ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY'),
  'precipitation', 1, 'CHIRPS'
);

// ERA5-Land: native unit is meters -> multiply by 1000 to convert to mm
var era5 = monthlySeries(
  ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR'),
  'total_precipitation_sum', 1000, 'ERA5-Land'
);

// GPM IMERG: native unit is mm/hr, half-hourly data
// factor 0.5 is an approximate scaling (mm/hr x half hour);
// verify against the officially aggregated monthly product
// before relying on this for final reporting.
var imerg = monthlySeries(
  ee.ImageCollection('NASA/GPM_L3/IMERG_V07'),
  'precipitation', 0.5, 'GPM_IMERG'
);

// ------------------------------------------------------------
// 4) Merge series and preview
// ------------------------------------------------------------
var allSeries = chirps.merge(era5).merge(imerg);
print('Sample of extracted data:', allSeries.limit(10));

// ------------------------------------------------------------
// 5) Comparison chart
// ------------------------------------------------------------
var chartAll = ui.Chart.feature.groups({
  features: allSeries,
  xProperty: 'date',
  yProperty: 'precip_mm',
  seriesProperty: 'source'
}).setChartType('LineChart')
  .setOptions({
    title: 'Monthly Rainfall - Elmanagil (2001-2023)',
    hAxis: {title: 'Date', slantedText: true},
    vAxis: {title: 'Rainfall (mm)'},
    lineWidth: 2,
    pointSize: 2
  });
print(chartAll);

// ------------------------------------------------------------
// 6) Annual mean rainfall maps (visual quality check)
// ------------------------------------------------------------
var visParams = {min: 0, max: 1200, palette: ['white', 'blue', 'darkblue']};

var chirpsAnnualMean = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate(startYear + '-01-01', endYear + '-12-31')
  .select('precipitation')
  .sum()
  .divide(endYear - startYear + 1)
  .clip(studyArea);
Map.addLayer(chirpsAnnualMean, visParams, 'CHIRPS - Annual Mean');

var era5AnnualMean = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
  .filterDate(startYear + '-01-01', endYear + '-12-31')
  .select('total_precipitation_sum')
  .sum()
  .multiply(1000)
  .divide(endYear - startYear + 1)
  .clip(studyArea);
Map.addLayer(era5AnnualMean, visParams, 'ERA5-Land - Annual Mean');

var imergAnnualMean = ee.ImageCollection('NASA/GPM_L3/IMERG_V07')
  .filterDate(startYear + '-01-01', endYear + '-12-31')
  .select('precipitation')
  .sum()
  .multiply(0.5)
  .divide(endYear - startYear + 1)
  .clip(studyArea);
Map.addLayer(imergAnnualMean, visParams, 'GPM IMERG - Annual Mean');

// ------------------------------------------------------------
// 7) Spatial difference map: ERA5-Land minus CHIRPS
//    Red = ERA5-Land underestimates; Blue = ERA5-Land overestimates
// ------------------------------------------------------------
var diffMap = era5AnnualMean.subtract(chirpsAnnualMean).clip(studyArea);

var diffVis = {
  min: -300, max: 300,
  palette: ['b2182b', 'ef8a62', 'fddbc7', 'f7f7f7', 'd1e5f0', '67a9cf', '2166ac']
};
Map.addLayer(diffMap, diffVis, 'Difference: ERA5-Land minus CHIRPS', false);

print('Difference map statistics (ERA5-Land - CHIRPS):',
  diffMap.reduceRegion({
    reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), '', true),
    geometry: studyArea,
    scale: scale,
    maxPixels: 1e9
  })
);

// ------------------------------------------------------------
// 8) JJAS-season-only maps (more meaningful than full-year mean
//    for this semi-arid, short-rainy-season area)
// ------------------------------------------------------------
function jjasMeanMap(collection, band, factor) {
  var years = ee.List.sequence(startYear, endYear);

  var yearlyJJAS = ee.ImageCollection.fromImages(years.map(function (y) {
    y = ee.Number(y);
    var start = ee.Date.fromYMD(y, 7, 1);
    var end   = ee.Date.fromYMD(y, 10, 1); // end of September
    return collection.filterDate(start, end).select(band).sum().multiply(factor);
  }));

  return yearlyJJAS.mean();
}

var chirpsJJAS = jjasMeanMap(
  ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY'), 'precipitation', 1
).clip(studyArea);

var era5JJAS = jjasMeanMap(
  ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR'), 'total_precipitation_sum', 1000
).clip(studyArea);

var imergJJAS = jjasMeanMap(
  ee.ImageCollection('NASA/GPM_L3/IMERG_V07'), 'precipitation', 0.5
).clip(studyArea);

var jjasVis = {min: 0, max: 700, palette: ['white', 'blue', 'darkblue']};

Map.addLayer(chirpsJJAS, jjasVis, 'CHIRPS - JJAS Season Mean', false);
Map.addLayer(era5JJAS, jjasVis, 'ERA5-Land - JJAS Season Mean', false);
Map.addLayer(imergJJAS, jjasVis, 'GPM IMERG - JJAS Season Mean', false);
// false = layer hidden by default; enable manually from the Layers panel

// ------------------------------------------------------------
// 9) Exports (run each task manually from the Tasks tab)
// ------------------------------------------------------------

// Monthly series as CSV
Export.table.toDrive({
  collection: allSeries,
  description: 'Elmanagil_Rainfall_Monthly_AllProducts',
  folder: 'ENTRO_Internship_Project',
  fileFormat: 'CSV'
});

// Annual mean maps
Export.image.toDrive({
  image: chirpsAnnualMean,
  description: 'Elmanagil_CHIRPS_AnnualMean_Map',
  folder: 'ENTRO_Internship_Project',
  region: studyArea, scale: scale, maxPixels: 1e9
});

Export.image.toDrive({
  image: era5AnnualMean,
  description: 'Elmanagil_ERA5Land_AnnualMean_Map',
  folder: 'ENTRO_Internship_Project',
  region: studyArea, scale: scale, maxPixels: 1e9
});

Export.image.toDrive({
  image: imergAnnualMean,
  description: 'Elmanagil_IMERG_AnnualMean_Map',
  folder: 'ENTRO_Internship_Project',
  region: studyArea, scale: scale, maxPixels: 1e9
});

// Difference map
Export.image.toDrive({
  image: diffMap,
  description: 'Elmanagil_Diff_ERA5minusCHIRPS_Map',
  folder: 'ENTRO_Internship_Project',
  region: studyArea, scale: scale, maxPixels: 1e9
});

// JJAS season maps
Export.image.toDrive({
  image: chirpsJJAS,
  description: 'Elmanagil_CHIRPS_JJAS_Map',
  folder: 'ENTRO_Internship_Project',
  region: studyArea, scale: scale, maxPixels: 1e9
});

Export.image.toDrive({
  image: era5JJAS,
  description: 'Elmanagil_ERA5Land_JJAS_Map',
  folder: 'ENTRO_Internship_Project',
  region: studyArea, scale: scale, maxPixels: 1e9
});

Export.image.toDrive({
  image: imergJJAS,
  description: 'Elmanagil_IMERG_JJAS_Map',
  folder: 'ENTRO_Internship_Project',
  region: studyArea, scale: scale, maxPixels: 1e9
});


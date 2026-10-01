
// ------------------------------------------------------------
// 1) Study area setup
// ------------------------------------------------------------
var studyArea = table.geometry();
var scale = 90; // approx. native resolution of MERIT Hydro

Map.centerObject(studyArea, 11);
Map.addLayer(studyArea, {color: 'red'}, 'Elmanagil boundary', false);

// ------------------------------------------------------------
// 2) Helper: normalize any layer to a 1-5 risk scale
//    (min-max scaling within the study area)
// ------------------------------------------------------------
function normalizeTo5(image, band, invert) {
  var stats = image.select(band).reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: studyArea,
    scale: scale,
    maxPixels: 1e9
  });

  var min = ee.Number(stats.get(band + '_min'));
  var max = ee.Number(stats.get(band + '_max'));

  var scaled = image.select(band).subtract(min).divide(max.subtract(min)); // 0 to 1

  if (invert) {
    scaled = ee.Image(1).subtract(scaled); // flip so lower raw value = higher risk
  }

  return scaled.multiply(4).add(1).rename(band + '_score'); // rescale to 1-5
}

// ------------------------------------------------------------
// 3) HAND (Height Above Nearest Drainage) - MERIT Hydro
//    Lower HAND (closer to a stream) = higher flood risk
// ------------------------------------------------------------
var meritHydro = ee.Image('MERIT/Hydro/v1_0_1');

var hand = meritHydro.select('hnd').clip(studyArea).rename('hnd');
var handScore = normalizeTo5(hand, 'hnd', true); // invert = true

Map.addLayer(hand, {min: 0, max: 30, palette: ['08519c', 'deebf7']}, 'HAND - raw', false);
Map.addLayer(handScore, {min: 1, max: 5, palette: ['1a9850', 'ffffbf', 'd73027']}, 'HAND - risk score (1-5)', false);

// ------------------------------------------------------------
// 4) Flow accumulation - MERIT Hydro
//    Higher accumulation = higher risk
// ------------------------------------------------------------
var flowAcc = meritHydro.select('upa').clip(studyArea).rename('upa');
var flowScore = normalizeTo5(flowAcc, 'upa', false); // invert = false

Map.addLayer(flowScore, {min: 1, max: 5, palette: ['1a9850', 'ffffbf', 'd73027']}, 'Flow accumulation - risk score (1-5)', false);

// ------------------------------------------------------------
// 5) Slope - SRTM DEM
//    Lower slope (flatter) = higher risk
// ------------------------------------------------------------
var dem = ee.Image('USGS/SRTMGL1_003').clip(studyArea);
var slope = ee.Terrain.slope(dem).rename('slope');
var slopeScore = normalizeTo5(slope, 'slope', true); // invert = true

Map.addLayer(slopeScore, {min: 1, max: 5, palette: ['1a9850', 'ffffbf', 'd73027']}, 'Slope - risk score (1-5)', false);

// ------------------------------------------------------------
// 6) Seasonal (JJAS) rainfall - CHIRPS
//    Higher rainfall = higher risk
// ------------------------------------------------------------
function jjasMeanMap(collection, band, factor, startYear, endYear) {
  var years = ee.List.sequence(startYear, endYear);
  var yearlyJJAS = ee.ImageCollection.fromImages(years.map(function (y) {
    y = ee.Number(y);
    var start = ee.Date.fromYMD(y, 7, 1);
    var end   = ee.Date.fromYMD(y, 10, 1);
    return collection.filterDate(start, end).select(band).sum().multiply(factor);
  }));
  return yearlyJJAS.mean();
}

var chirpsJJAS = jjasMeanMap(
  ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY'), 'precipitation', 1, 2001, 2023
).clip(studyArea).rename('rain');

var rainScore = normalizeTo5(chirpsJJAS, 'rain', false); // invert = false

Map.addLayer(rainScore, {min: 1, max: 5, palette: ['1a9850', 'ffffbf', 'd73027']}, 'Seasonal rainfall - risk score (1-5)', false);

// ------------------------------------------------------------
// 7) Land cover - ESA WorldCover
//    Manual risk classification per land cover class
//    Codes: 10=Trees,20=Shrubland,30=Grassland,40=Cropland,
//           50=Built-up,60=Bare,80=Water,90=Wetland,
//           95=Mangroves,100=Moss/Lichen
// ------------------------------------------------------------
var landcover = ee.ImageCollection('ESA/WorldCover/v200').first().clip(studyArea);

var fromValues = [10, 20, 30, 40, 50, 60, 80, 90, 95, 100];
var toRisk     = [1,  2,  2,  4,  4,  1,  5,  5,  2,  1];

var landcoverScore = landcover.select('Map')
  .remap(fromValues, toRisk)
  .rename('lc_score');

Map.addLayer(landcoverScore, {min: 1, max: 5, palette: ['1a9850', 'ffffbf', 'd73027']}, 'Land cover - risk score (1-5)', false);

// ------------------------------------------------------------
// 8) Final weighted overlay
//    Weights below are assumption-based (documented as a
//    limitation in the technical report), not calibrated
//    against observed flood data.
// ------------------------------------------------------------
var weights = {
  hand: 0.35,
  flowAcc: 0.20,
  slope: 0.20,
  rain: 0.15,
  landcover: 0.10
};

var floodSusceptibility = handScore.multiply(weights.hand)
  .add(flowScore.multiply(weights.flowAcc))
  .add(slopeScore.multiply(weights.slope))
  .add(rainScore.multiply(weights.rain))
  .add(landcoverScore.multiply(weights.landcover))
  .rename('flood_susceptibility');

var finalVis = {
  min: 2.3, max: 4.9,
  palette: ['1a9850', '91cf60', 'ffffbf', 'fc8d59', 'd73027']
  // green = lower susceptibility -> red = higher susceptibility
};

Map.addLayer(floodSusceptibility, finalVis, 'Flood susceptibility - final map');

// ------------------------------------------------------------
// 9) Print summary statistics
// ------------------------------------------------------------
var finalStats = floodSusceptibility.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), '', true),
  geometry: studyArea,
  scale: scale,
  maxPixels: 1e9
});
print('Final flood susceptibility statistics:', finalStats);

var percentileStats = floodSusceptibility.reduceRegion({
  reducer: ee.Reducer.percentile([2, 98]),
  geometry: studyArea,
  scale: scale,
  maxPixels: 1e9
});
print('2nd-98th percentile range:', percentileStats);

// ------------------------------------------------------------
// 10) Exports (run manually from the Tasks tab)
//     .toFloat() applied to avoid data-type mismatch errors
// ------------------------------------------------------------
Export.image.toDrive({
  image: floodSusceptibility.toFloat(),
  description: 'Elmanagil_Flood_Susceptibility_Final',
  folder: 'ENTRO_Internship_Project',
  region: studyArea,
  scale: scale,
  maxPixels: 1e9
});

Export.image.toDrive({
  image: handScore.toFloat()
    .addBands(flowScore.toFloat())
    .addBands(slopeScore.toFloat())
    .addBands(rainScore.toFloat())
    .addBands(landcoverScore.toFloat()),
  description: 'Elmanagil_Flood_Risk_InputLayers',
  folder: 'ENTRO_Internship_Project',
  region: studyArea,
  scale: scale,
  maxPixels: 1e9
});


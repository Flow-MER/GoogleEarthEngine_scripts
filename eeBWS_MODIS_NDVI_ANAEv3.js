/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var anaev3 = ee.FeatureCollection("projects/ee-litepc/assets/ANAEv3_gt1ha");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

// #############################################################################
// BWS Vulnerabilities project (2022)  MDBA/CEWO
// rejigged for Flow-MER (2024)
// Shane Brooks shane@brooks.eco
// This code uses AVHRR and MODIS NDVI products from Google's Earth Engine Library to
// calculate the average NDVI per ANAE polygon per calendar year 1986-2024
// The code would not run in one bite so was done in two batches and outputs were harmonised and appended


// #############################################################################
// polygons is the ANAEv3 susbset > 1 Ha as small polys do not reliably align to pixel grids and fail to rasterise
//analysis is done with scale of 30m

//var polygons = anaev3
var polygons = anaev3
  //.limit(10)   //limit polygons for testing
  ;
var mdb = ee.Geometry.Polygon(
  [[[138.5, -37.6],
  [152.5, -37.6],
  [152.5, -24.5],
  [138.5, -24.5]]], null, false);

// #############################################################################
// Prep the image collections.
// the full sequence of 1987-2024 requires two NDVI data sources, both are 250m x 16day
// so we convert to annual averages

// var short_source = 'AVHRR'
// var image_collection_name = 'NOAA/CDR/AVHRR/NDVI/V5';
// var start_year = 1986;
// var end_year = 2000;

var short_source = 'MODIS'
var image_collection_name = 'MODIS/061/MOD13Q1';
var start_year = 2001;
var end_year = 2024;

var export_filename = 'NDVI_' + start_year.toString() + '-' + end_year.toString() + '_ANAEv3_annual_' + short_source


var ndvi_collection = ee.ImageCollection(image_collection_name);

//Function to mask each image in the collection to positive NDVI to exclude water
var ndvi_masked = ndvi_collection.map(function (image) {
  return image.mask(image.select("NDVI").gt(0)).clip(mdb).select("NDVI")
})

//make a list of years and filter the 16 day NDVI into annual averages
var annual_ndvi = ee.List.sequence(start_year, end_year, 1).map(function (year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  return ndvi_masked
    .filterDate(start, end)
    .mean().multiply(0.0001)
    .set('year', start.format("YYYY"));
});

var rasters_to_analyse = ee.ImageCollection(annual_ndvi);
print(export_filename);
print ('rasters_to_analyse', rasters_to_analyse);
var ndvi_img = rasters_to_analyse.first();
var ndviVis = {
  min: 0.0,
  max: 1.0,
  palette: [
    'ffffff', 'ce7e45', 'fcd163', 'c6ca02', '22cc04', '99b718', '207401',
    '012e01'
  ],
};
Map.addLayer(ndvi_img, ndviVis, 'NDVI');

// Function to be mapped over the NDVI image collection that calculates
// mean NDVI per image for all polygons using the 'reduceRegions' method.
// analogous to GIS zonal statistics.

var reduceRegions = function(image) {
  var ndvi = image.reduceRegions({
                      collection: polygons,
                      reducer: ee.Reducer.mean(),
                      scale: 30,  //modis is 250m but dont want to loose small/narrow polys in the calc
                      tileScale: 4
  });
  return ndvi
    // ...remove any features that have a null value for any property.
    .filter(ee.Filter.notNull(['mean']))
    // ...map over the featureCollection to select and rename properties of interest.
    .map(function(feature) {
      return feature
        .select(['mean', 'UID'], ['NDVI', 'UID'])
        .set({'year': image.get('year')});
  });
};


// Apply the above defined function to all images. 
var zonal_stats = rasters_to_analyse.map(reduceRegions)
  .flatten();
  

// Strip out the geometry for export
var export_zonal_stats = zonal_stats.select([".*"], null, false);



// Export the table of results to GoogleDrive as a CSV file
//** CHANGE 'description' to identify which NDVI image collection is run
Export.table.toDrive({
  collection: export_zonal_stats,
  description: export_filename,
  fileFormat: 'CSV',
  selectors: ['UID', 'year','NDVI']
});

// Note the various output tables were concatenated in python into a single 1986-2022 data file

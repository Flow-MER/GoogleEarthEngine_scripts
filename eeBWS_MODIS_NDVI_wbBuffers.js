/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var anaev3 = ee.FeatureCollection("projects/ee-litepc/assets/ANAEv3_BWS"),
    wbBuffers = ee.FeatureCollection("projects/ee-litepc/assets/ForagingZones_Specialist");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// #############################################################################
// polygons is the ANAEv3 susbset used for the BWS Vulnerabilities project.
// It is the subset of ANAE polygons that intersect the managed floodplain with additonal
// polygons that intersect MDBA waterbird areas and Ramar sites

//var polygons = anaev3
var polygons = wbBuffers
    //.limit(10)   //limit polygons for testing
    ; 
var batch = require('users/fitoprincipe/geetools:batch')

// #############################################################################
// Prep the image collections. 
// the full sequence of 1987-2022 requires two NDVI data sources, both are 250m x 16day
// so we convert to annual averages

var AVHRR_NDVI = ee.ImageCollection("NOAA/CDR/AVHRR/NDVI/V5");
//make a list of years and filter the 16 day NDVI into annual averages
var AVHRR_years = ee.List.sequence(1986, 1999, 1).map(function(year){
  var start = ee.Number(year);
  var end = start.add(ee.Number(1));
  var ndviMeanYear = AVHRR_NDVI.select('NDVI')
                              .filter(ee.Filter.calendarRange(start, end, 'year')).mean().multiply(0.0001);
  return ndviMeanYear.set('year', start);
});

var NDVI_1986_1999 = ee.ImageCollection(AVHRR_years);  
//print ('NDVI_1986_1999', NDVI_1986_1999);

var modisNDVI = ee.ImageCollection('MODIS/061/MOD13Q1');
//make a list of years and filter the 16 day NDVI into annual averages
var modis_years = ee.List.sequence(2000, 2022, 1).map(function(year){
  var start = ee.Number(year);
  var end = start.add(ee.Number(1));
  var ndviMeanYear = modisNDVI.select('NDVI')
                              .filter(ee.Filter.calendarRange(start, end, 'year')).mean().multiply(0.0001);
  return ndviMeanYear.set('year', start);
});

var NDVI = function(image) {
  return image.expression('float(b("NDVI")/10000)')
};


var mNDVI = modisNDVI.select('NDVI')
  .filterDate(ee.Date('2016-07-01'), ee.Date('2017-07-01'))
  .map(NDVI);

print ('mNDVI',mNDVI);

var NDVI_2000_2022 = ee.ImageCollection(modis_years);
//print ('NDVI_2000_2022', NDVI_2000_2022);


// Can merge the two sequences but to speed up processing each set was run separately
// first attempt at 37 years together timed out after 12 hours
//var allNDVI = NDVI_1986_1999.merge(NDVI_2000_2022);

// #############################################################################
// *** Toggle these to process each batch
// *** DONT FORGET TO RENAME the exported filename -see 'description' below
//
// running times 30mins-10h - took a few attempts to complete.
//
//var rasters_to_analyse = NDVI_1986_1999;
//ar rasters_to_analyse = NDVI_2000_2022;
var rasters_to_analyse = mNDVI
print ('rasters_to_analyse', rasters_to_analyse);


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
        .select(['mean', 'Name'], ['NDVI', 'Name'])
        .set({'date': image.get('system:index')});
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
  description: 'ForagingZones_SpecialistNDVI',
  fileFormat: 'CSV',
  selectors: ['NDVI', 'Name', 'date']
});

batch.Download.ImageCollection.toDrive(mNDVI, 'Folder', 
                {scale: 10, 
                 region: polygons.getInfo()["coordinates"], 
                 type: 'float'})

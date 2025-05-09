/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var wbBuffersS = ee.FeatureCollection("projects/ee-litepc/assets/ForagingZones_Specialist"),
    wbBuffersG = ee.FeatureCollection("projects/ee-litepc/assets/ForagingZones_Generalist"),
    test142 = ee.FeatureCollection("projects/ee-litepc/assets/test142");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

// #############################################################################
// BWS Vulnerabilities project (2022)  MDBA/CEWO
// Shane Brooks shane@brooks.eco - 22/01/2023
// This code uses AVHRR and MODIS NDVI products from Google's Earth Engine Library to
// calculate the average NDVI per ANAE polygon per calendar year 1986-2022
// The code would not run in one bite so was done in a couple of batches and outputs were appended


// #############################################################################
// polygons is the ANAEv3 susbset used for the BWS Vulnerabilities project.
// It is the subset of ANAE redgum, blackbox and coolibah polygons > 1 Ha that intersect
// the managed floodplain with some additonal polygons added that intersect MDBA waterbird areas and Ramar sites
// e.g. to fix that Kerang Lakes is not on the MDBA "Managed Floodplain" layer

// #############################################################################
// polygons is the ANAEv3 susbset used for the BWS Vulnerabilities project.
// It is the subset of ANAE polygons that intersect the managed floodplain with additonal
// polygons that intersect MDBA waterbird areas and Ramar sites

//var polygons = anaev3
var polygons = wbBuffersG  //.limit(10)   //limit polygons for testing

    //.limit(10)   //limit polygons for testing
    ; 


// #############################################################################
// Prep the image collections. 
// the full sequence of 1987-2022 requires two NDVI data sources, both are 250m x 16day
// so we convert to annual averages

var AVHRR_NDVI = ee.ImageCollection("NOAA/CDR/AVHRR/NDVI/V5");
//make a list of years and filter the 16 day NDVI into annual averages
var AVHRR_years = ee.List.sequence(1986, 1999, 1).map(function(year){
  var start = ee.Date.fromYMD(year, 1, 1)
  var end = start.advance(1, 'year');
  var ndviMeanYear = AVHRR_NDVI.select('NDVI')
                              .filterDate(start, end).mean().multiply(0.0001);
  return ndviMeanYear.set('year', start.format("YYYY"));
});

var NDVI_1986_1999 = ee.ImageCollection(AVHRR_years);  
//print ('NDVI_1986_1999', NDVI_1986_1999);

var modisNDVI = ee.ImageCollection('MODIS/061/MOD13Q1');
//make a list of years and filter the 16 day NDVI into annual averages
var modis_years = ee.List.sequence(2000, 2022, 1).map(function(year){
  var start = ee.Date.fromYMD(year, 1, 1)
  var end = start.advance(1, 'year');
  var ndviMeanYear = modisNDVI.select('NDVI')
                              .filterDate(start, end).mean().multiply(0.0001);
  return ndviMeanYear.set('year', start.format("YYYY"));
});
var NDVI_2000_2022 = ee.ImageCollection(modis_years);
//print ('NDVI_2000_2022', NDVI_2000_2022);


// Can merge the two sequences but to speed up processing each set was run separately
// first attempt at 37 years together timed out after 12 hours
var allNDVI = NDVI_1986_1999.merge(NDVI_2000_2022);

// #############################################################################
// *** Toggle these to process each batch
// *** DONT FORGET TO RENAME the exported filename -see 'description' below
//
// running times 30mins-10h - took a few attempts to complete.
//
//var rasters_to_analyse = NDVI_1986_1999;
var rasters_to_analyse = allNDVI;
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
        .select(['mean', 'colony', 'feedzone'], ['NDVI', 'colony', 'feedzone'])
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
  description: 'FZ_generalist_NDVI',
  fileFormat: 'CSV',
  selectors: ['NDVI', 'colony', 'feedzone', 'year']
});

// Note the various output tables were concatenated in python into a single 1986-2022 data file

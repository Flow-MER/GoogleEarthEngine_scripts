/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var condcol = ee.ImageCollection("users/Projects/Condition_8bit"),
    anaev3 = ee.FeatureCollection("projects/ee-litepc/assets/ANAEv3_BWS");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// #############################################################################
// BWS Vulnerabilities project (2022)  MDBA/CEWO
// Shane Brooks shane@brooks.eco - 22/01/2023
// This code uses the MDBA Tree Stand Condition Tool rasters to calculates the
// average Tree Condition per epoc in ANAE Polygons dominated by redgum, blackbox and coolibah

// #############################################################################
// polygons is the ANAEv3 susbset used for the BWS Vulnerabilities project.
// It is the subset of ANAE redgum, blackbox and coolibah polygons > 1 Ha that intersect
// the managed floodplain with some additonal polygons added that intersect MDBA waterbird areas and Ramar sites
// e.g. to fix that Kerang Lakes is not on the MDBA "Managed Floodplain" layer

var polygons = anaev3
    //.limit(10)   //limit polygons for testing
    ; 


//condcol is the MDBA SCT/TSC condition collection
print('condcol',condcol);



// #############################################################################
// Function to be mapped over the MDBA SCT/TSC image collection that calculates
// mean_TSC per image for all polygons using the 'reduceRegions' method.
// analogous to GIS zonal statistics.

var reduceRegions = function(image) {
  var meanTSC = image.reduceRegions({
                      collection: anaev3,
                      reducer: ee.Reducer.mean(),
                      scale: 30,
                      tileScale: 4
  });
  return meanTSC
    // ...remove any features that have a null value for any property.
    .filter(ee.Filter.notNull(['mean']))
    // ...map over the featureCollection to rename and select properties of interest.
    .map(function(feature) {
      return feature
        .select(['mean', 'UID'], ['meanTSC', 'UID'])
        .set({
          'imgID': image.id(),
      });
  });
};

// Apply the above defined function to all images.
var condcol_reduceRegions = condcol.map(reduceRegions)
  .flatten();
  
// Remove geometry for export
var export_area = condcol_reduceRegions.select([".*"], null, false);


// Export the table of results to GoogleDrive as a CSV file
Export.table.toDrive({
  collection: export_area,
  description: 'anaev3_condcol_reduceRegions',
  fileFormat: 'CSV',
  selectors: ['meanTSC', 'UID', 'imgID']
});



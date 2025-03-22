/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var anae3 = ee.FeatureCollection("projects/ee-litepc/assets/ANAEv3_gt1ha");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//sFollows example from.
//https://google-earth-engine.com/Advanced-Topics/Scaling-up-in-Earth-Engine/

// Load polygon dataset.
var featColl=anae3
    //.limit(100)   //limit polygons for testing
    ; 



var uniqueID='UID';


// Specify years of interest and collection
var startYear=1986;
var endYear=2000; //inclusive
var imageCollectionName='NOAA/CDR/AVHRR/NDVI/V5';
// var startYear=2002;
// var endYear=2022; //inclusive
// var imageCollectionName='MODIS/061/MOD13Q1';

var bandsWanted=['NDVI'];
var scale=30;

// Export info.
var exportFolder='GEE_NDVI_ANAE';
var filenameBase='NDVI_ANAEv3_monthly_AVHRR_';

// Initiate a loop, in which the variable i takes on values of each year.
for (var i=startYear; i <=endYear; i++){        // for each year....
 
  // Load climate collection for that year.
  var startDate=ee.Date(i + '-01-01');
  
  var endYear_adj=i + 1;
  var endDate=ee.Date(endYear_adj + '-01-01');


  // make NDVI image collection of montly mean AVHRR is daily, MODIS is 16 days

  var ndviCollection = ee.ImageCollection(imageCollectionName)
    .select('NDVI')
    .filterDate(startDate, endDate)
    .map(function (image) {
      return image.mask(image.select('NDVI').gt(0))
        .copyProperties(image, image.propertyNames());
    });
  
  var numberOfMonths = endDate.difference(startDate, 'months').round();
  var monthOffsets = ee.List.sequence(0, numberOfMonths.subtract(1));
  var monthlyNdviCollection = ee.ImageCollection(
    monthOffsets.map(function (monthOffset) {
      var dateRange = startDate
        .advance(ee.Number(monthOffset), 'months')
        .getRange('month');
      return ndviCollection
        .filterDate(dateRange)
        .mean().multiply(0.0001)
        //.clip(aoi)
        .set('system:time_start', dateRange.start().format("yyyy-MM-dd"))
        .set('system:time_end', dateRange.end().format("yyyy-MM-dd"))
        .set('yearmonth', dateRange.start().format('yyyyMM'));
    })
  );

  print ('monthlyNdviCollection',monthlyNdviCollection);
  
  // // Get values at feature collection.
  // var sampledFeatures=monthlyNdviCollection.map(function(image){
  //   return image.reduceRegions({
  //       collection: featColl,
  //       reducer: ee.Reducer.mean(),        
  //       tileScale: 1,
  //       scale: scale
  //   }).filter(ee.Filter.notNull(bandsWanted))  // remove rows without data
  //     .map(function(f){                  // add date property
  //       var time_start=image.get('system:time_start');
  //       var dte=ee.Date(time_start).format('YYYYMMdd');
  //       return f.set('date_ymd', dte);
  //   });
  // }).flatten();
  
  
  // Function to be mapped over the NDVI image collection that calculates
// mean NDVI per image for all polygons using the 'reduceRegions' method.
// analogous to GIS zonal statistics.

  var reduceRegions = function(image) {
    var ndvi = image.reduceRegions({
                        collection: featColl,
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
          .set({'yearmonth': image.get('yearmonth'),'date_start': image.get('system:time_start')});
    });
  };
  
  // Apply the above defined function to all images. 
  var zonal_stats = monthlyNdviCollection.map(reduceRegions)
    .flatten();
  // Strip out the geometry for export
  var export_zonal_stats = zonal_stats.select([".*"], null, false);

  // Prepare export: specify properties and filename.
  var columnsWanted=[uniqueID].concat(['yearmonth','date_start'], bandsWanted);
  var filename=filenameBase + i;
 

 
  Export.table.toDrive({
    collection: export_zonal_stats,
    description: filename,
    folder: exportFolder,
    fileFormat: 'CSV',
    selectors: columnsWanted
  });
 
} 
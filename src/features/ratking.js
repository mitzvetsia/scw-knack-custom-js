
// DEPRECATE? fairly certain Knack's new native setting "keep open till action" obviates the need for this
/* Change the below scene_1 to the specific scene for your application or use `any` to enable for all scenes */
/* Turns off modal pages closing when clicking off to the side? */
  $(document).on('knack-scene-render.any', function(event, scene) {
    $('.kn-modal-bg').off('click');
  });


$(document).on('knack-view-render.view_1519', function (event, view, data) {
 setTimeout(function(){
  $('input#field_932').attr('value', '5deebcd9525d220015a14e1f');  // this works
    },1); //set timeout value
});


// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-modal-render.view_1328', function(event, view, record){
setTimeout(function(){
  
 $('input#field_737').attr('value', 'Create_Project');   
  
  },1); //set timeout value
});

// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-scene-render.scene_208', function(event, view, record){
setTimeout(function(){
  
 $('input#field_877').attr('value', 'Deputy 8.0');   
  
  },1); //set timeout value
});

// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-modal-render.view_1457', function(event, view, record){
setTimeout(function(){
  
 $('input#field_737').attr('value', 'Create_Project');   
  
  },1); //set timeout value
});


/*
// Change view_1 to the table view you want to listen to
$(document).on('knack-cell-update.view_32', function(event, view, record) {
  // Do something after the inline edit
 // alert('updated a record for table view: ' + view.key);
  Knack.views["view_32"].model.fetch();
  console.log("hello world");
  console.log(Knack.views);
});
*/


$(document).on('knack-cell-update.view_1991', function(event, view, data) {

setTimeout(function () { location.hash = location.hash + "#"; }, 100);
//alert("Click 'OK' to update equipment total");
Knack.showSpinner();
  });

 


$(document).on('knack-record-update.view_1493', function(event, view, record) {
  // Do something after the inline edit
  alert("Click 'OK' to update equipment total");
  Knack.views["view_1493"].model.fetch();
  console.log("hello world");
  console.log(Knack.views);
});




var view_names = ["view_832"]; ///add view numbers as necessary

view_names.forEach(bindToUpdate1);

function bindToUpdate1(selector_view_name){
$(document).on('knack-view-render.' + selector_view_name, function(event, view, data) {

$(document).ready(function(){
$('.ui-timepicker-input').timepicker({
minTime: '09:30:00',     //  7:00 AM,  Change as necessary
maxTime: '16:30:00'        //  7:00 PM,  Change as necessary

});
});
});

}







//Call the function when your table renders

//AS Built Other Equipment
$(document).on('knack-view-render.view_2147', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AS Built Cameras
$(document).on('knack-view-render.view_2128', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Client Dashboard > Installation Projects
$(document).on('knack-view-render.view_249', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Client Dashboard > Quotes
//$(document).on('knack-view-render.view_1160', function (event, view , data) {
 // addGroupExpandCollapse(view);
//})

//ADMIN: Missing CoCs
$(document).on('knack-view-render.view_1671', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN: Missing System Details Reports
$(document).on('knack-view-render.view_1672', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN: Scheduled
$(document).on('knack-view-render.view_1674', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN > All > Missing CoCs
$(document).on('knack-view-render.view_1792', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN > All > Bid Accepted
$(document).on('knack-view-render.view_1673', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN > All > In Work
$(document).on('knack-view-render.view_1676', function (event, view , data) {
  addGroupExpandCollapse(view);
})
  
//Quote dashboard: Events
$(document).on('knack-view-render.view_1050', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AVL Job Reports: Past Job Reports
$(document).on('knack-view-render.view_845', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AVL Job Reports: Past Job Reports
$(document).on('knack-view-render.view_1420', function (event, view , data) {
  addGroupExpandCollapse(view);
})


//AVL Job Reports: In Work & Scheduled Quotes
$(document).on('knack-view-render.view_1231', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//TRIAD Job Reports: In Work & Scheduled Quotes
$(document).on('knack-view-render.view_1392', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AVL Job Reports: All Jobs
$(document).on('knack-view-render.view_1257', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//TRIAD Job Reports: All Jobs
$(document).on('knack-view-render.view_1418', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Technician View > Jobs > Upcoming Projects
$(document).on('knack-view-render.view_1681', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Technician View > In Work > Upcoming Projects
$(document).on('knack-view-render.view_1596', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Technician View > In Work NEW TABLE
$(document).on('knack-view-render.view_1682', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Project Managment > Services Manager > Accepted Bids
$(document).on('knack-view-render.view_1662', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Project Managment > Services Manager > Scheduled Projects
$(document).on('knack-view-render.view_1838', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Project Summary > Cameras or Runs
$(document).on('knack-view-render.view_730', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Tech View > Schedules > Job Lead
$(document).on('knack-view-render.view_1602', function (event, view , data) {
  addGroupExpandCollapse(view);
})





// function that adds expand & collapse to tables with grouping
var addGroupExpandCollapse = function(view) {
  
  $('#' + view.key + ' .kn-table-group').css("cursor","pointer");

  $('#' + view.key + " .kn-group-level-1 td").each(function () {
    if($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }

    });

      $('#' + view.key + " .kn-group-level-1 td").each(function () {
    if($(this).text().length < 1) {
      var RowText = $(this).html() + "Unassigned";
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
});

  $('#' + view.key + " .kn-group-level-2 td").each(function () {
    if($(this).text().length <= 1) {
      var RowText = $(this).html() + "Unassigned";
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
});
  
  $('#' + view.key + ' .kn-table-group').nextUntil('.kn-table-group').toggle();


  
  $('#' + view.key + ' .kn-table-group').click(function() {
    
    $(this).nextUntil('.kn-table-group').toggle();
    
    if($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
  
}





// Admin
$(document).on('knack-view-render.view_1218', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Tasks
$(document).on('knack-view-render.view_1190', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Change Orders
$(document).on('knack-view-render.view_1584', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Project Notes
$(document).on('knack-view-render.view_1559', function (event, view , data) {
  addSceneExpandCollapse(view);
  })
  
// Micah's Shit - System Details
$(document).on('knack-view-render.view_1380', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Daily's
$(document).on('knack-view-render.view_760', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Tasks
$(document).on('knack-view-render.view_1212', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Micah's Shit - Project Notes
$(document).on('knack-view-render.view_462', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Micah's Shit - Job Reports
//$(document).on('knack-view-render.view_760', function (event, view , data) {
//  addSceneExpandCollapse(view);
//})

// Micah's Shit - Closeout Reports
$(document).on('knack-view-render.view_1049', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Micah's Shit - Complete Tasks
$(document).on('knack-view-render.view_1314', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Dashboard - Comments
$(document).on('knack-view-render.view_1224', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Dashboard - Project Notes
$(document).on('knack-view-render.view_1498', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > past job reports
$(document).on('knack-view-render.view_845', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > in work & scheduled jobs
$(document).on('knack-view-render.view_1231', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > all jobs
$(document).on('knack-view-render.view_1257', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > past job reports
$(document).on('knack-view-render.view_1420', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > in work & scheduled jobs
$(document).on('knack-view-render.view_1392', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > all jobs
$(document).on('knack-view-render.view_1418', function (event, view , data) {
  addSceneExpandCollapse(view);
})


// Job Reports > In Work > comments and tasks
$(document).on('knack-view-render.view_1302', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Job Reports > In Work > project notes
$(document).on('knack-view-render.view_1309', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > Service Calls & Troubleshooting
$(document).on('knack-view-render.view_1361', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > Service Calls & Troubleshooting
$(document).on('knack-view-render.view_1411', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Summary > Events
$(document).on('knack-view-render.view_1185', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Summary > Site Maps
$(document).on('knack-view-render.view_1368', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Summary > Job Reports
$(document).on('knack-view-render.view_1710', function (event, view , data) {
  addSceneExpandCollapse(view);
})

//BUILD QUOTE > edit quote copy
$(document).on('knack-view-render.view_2812', function (event, view , data) {
  addSceneExpandCollapse(view);
})






// Project Summary > Contacts
$(document).on('knack-view-render.view_899', function (event, view , data) {
  addSceneExpandCollapse(view);
})


/*SALES EDIT QUOTE > HEADEND EQUIPMENT
$(document).on('knack-view-render.view_2843', function (event, view , data) {
  addSceneExpandCollapse(view);
})
*/

/*SALES EDIT QUOTE > HEADEND COPY
$(document).on('knack-view-render.view_2864', function (event, view , data) {
  addSceneExpandCollapse(view);
})
*/


// function that adds expand & collapse scenes
var addSceneExpandCollapse = function(view) {
  
  $('#' + view.key + ' .view-header').css("cursor","pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
  });
  
  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();
  
   $('#' + view.key + ' .view-header').click(function() {
    
    $(this).nextUntil('.view-header').toggle();
    
    if($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
  
 
}





// function that adds expand & collapse scenes
var addSceneExpandCollapseMultiple = function(view) {
  
  $('#' + view.key + ' .view-header').css("cursor","pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o"; ></i>&nbsp;' + RowText);
    }
  });
  
  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();
  
   $('#' + view.key + ' .view-header').click(function() {
    
    $(this).nextUntil('.view-header').toggle();
    
    if($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
  
 
}


 //     $('#' + view.key + " .kn-group-level-1 td").each(function () {









var addCheckboxes = function(view) {
   
  // add the checkbox to to the header to select/unselect all
  $('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
  
  
  $('#' + view.key + '.kn-table thead input').change(function() {   
    $('.' + view.key + '.kn-table tbody tr input').each(function() {
      $(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
    });
  });
  
   
  // add a checkbox to each row in the table body
  $('#' + view.key + '.kn-table tbody tr').each(function() {
    $(this).prepend('<td><input type="checkbox"></td>');
  });
}




/**** CHANGE VIEW_ID TO YOUR OWN VIEW ID ****/
$(document).on('knack-view-render.view_1509', function(event, view) {


   
  // Add discount description
  $('<div><hr></br></div>'
   ).insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(3)');
  
  //modify text around discount amount
  $('<span>-</span>'
   ).insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span');  
  
 $('<span> discount for Annual plan = </span>'
   ).insertAfter('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span:nth-child(2)');
  

  


});


  
//  #view_1509 > section > div:nth-child(2) > div:nth-child(3) > div


/**** Check Boxes on Build Quote ****/
/*
$(document).on('knack-view-render.view_32', function(event, view) {


   
  // Add an update button
  $('<button id="update"; style="font-weight: 300; margin:10px; padding: 5px; font-size: 12pt;">Mark Tasks Complete</button>'
   ).insertBefore('#' + view.key + '.kn-table thead tr');
  
  // Add checkboxes to our table
  addCheckboxes(view);
  
  $("#update").click(function() {
    es_last_updated();
  });
  
  });

function es_last_updated() {
   //add variable here this example does a pop up box to enter information
  var checkNumber = prompt("Enter Check Number");
   Knack.showSpinner(); } 

*/





/*

// Function that adds checkboxes to view_32
var addCheckboxes = function(view) {

// Add the checkbox to to the header to select/unselect all
$('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
$('#' + view.key + '.kn-table thead input').change(function() {
$('.' + view.key + '.kn-table tbody tr input').each(function() {
$(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
});
});

// Add a checkbox to each row in the table body
$('#' + view.key + '.kn-table tbody tr').each(function() {
$(this).prepend('<td><input type="checkbox"></td>');
});
}

$(document).on('knack-view-render.view_32', function (event, view) {

// Add Delete Records + add to quote buttons
//$('<button style="margin:20px 20px 20px 0; padding:10px; font-size:14px; font-weight:600;" id="OutofWarranty"">Delete Runs</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');
//$('<button style="margin:20px 20px 20px 0; padding:10px; font-size:14px; font-weight:600;" id="AddtoQuote"">Add Runs to Quote</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');

$('<button style="padding:5px; margin:5px; fontsize=12px;" id="OutofWarranty"">Delete Runs</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');
$('<button style="padding:5px; margin:5px; fontsize=12px;" id="AddtoQuote"">Add Runs to Quote</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');


//Add checkboxes to table
addCheckboxes(view);


// Click event for the add to supplier auth button
$('#OutofWarranty').click(function () {

// Array of record IDs
var record_ids = [];

// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/j43lwblm9pjmo9ypjt3825789n9dodi8?recordid=" + record_ids;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to delete ' + selectedRecords + ' record(s)?');
Knack.hideSpinner();

window.location.reload(true);

})




// Click event for the add to supplier auth button
$('#AddtoQuote').click(function () {

// Array of record IDs
var record_ids = [];
var quoteNumber = prompt("Enter LAST FOUR numbers of Quote Number you want to add these Runs");


// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/azj3bt7zjoy11ie5thevpnx3v2poagek?recordid=" + record_ids + "&quoteNumber=" + quoteNumber;



$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to assign these ' + selectedRecords + ' runs to additional quote ending in ' + quoteNumber + '?');
Knack.hideSpinner();

window.location.reload(true);

})
});


*/

/*
// Function that adds checkboxes to view_208
var addCheckboxes = function(view) {

// Add the checkbox to to the header to select/unselect all
$('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
$('#' + view.key + '.kn-table thead input').change(function() {
$('.' + view.key + '.kn-table tbody tr input').each(function() {
$(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
});
});

// Add a checkbox to each row in the table body
$('#' + view.key + '.kn-table tbody tr').each(function() {
$(this).prepend('<td><input type="checkbox"></td>');
});
}

$(document).on('knack-view-render.view_207', function (event, view) {

// Add Delete Records + add to quote buttons
$('<button id="DeleteEquipment"">Delete Runs</button>').insertAfter('#view_207 > div.kn-records-nav > div:nth-child(3)');
$('<button id="AddtoEquipmentQuote"">Add Equipment to Quote</button>').insertAfter('#view_207 > div.kn-records-nav > div:nth-child(3)');


//Add checkboxes to table
addCheckboxes(view);


// Click event for the add to supplier auth button
$('#DeleteEquipment').click(function () {

// Array of record IDs
var record_ids = [];

// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/j43lwblm9pjmo9ypjt3825789n9dodi8?recordid=" + record_ids;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to delete ' + selectedRecords + ' record(s)?');
Knack.hideSpinner();

window.location.reload(true);

})




// Click event for the add to supplier auth button
$('#AddtoEquipmentQuote').click(function () {

// Array of record IDs
var record_ids = [];
var quoteNumber = prompt("Add this equipment to quote ending (enter ONLY the LAST FOUR numbers):");


// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/azj3bt7zjoy11ie5thevpnx3v2poagek?recordid=" + record_ids + "&quoteNumber=" + quoteNumber;



$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to assign these ' + selectedRecords + ' equipment items to additional quote ending in ' + quoteNumber + '?');
Knack.hideSpinner();

window.location.reload(true);

})
});

*/

$(document).on('knack-record-update.view_2074', function(event, view, record) {
location.hash = location.hash + "#"
});

$(document).on('knack-record-update.view_2083', function(event, view, record) {
location.hash = location.hash + "#"
});

$(document).on('knack-record-update.view_2078', function(event, view, record) {
location.hash = location.hash + "#"
});

$(document).on('knack-record-update.view_2084', function(event, view, record) {
location.hash = location.hash + "#"
});





//add photos to this Run... 


// Function that adds checkboxes
var addCheckboxes = function(view) {
// Add the checkbox to to the header to select/unselect all
$('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
$('#' + view.key + '.kn-table thead input').change(function() {
$('.' + view.key + '.kn-table tbody tr input').each(function() {
$(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
});
});

// Add a checkbox to each row in the table body
$('#' + view.key + '.kn-table tbody tr').each(function() {
$(this).prepend('<td><input type="checkbox"></td>');
});
}

$(document).on('knack-view-render.view_2179', function (event, view) {

// Add add to supplier Auth button
$('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="assignphotos"">Assign Photos to Run</button>').insertAfter('#view_2179 > div.view-header > h2');


//Add checkboxes to table
addCheckboxes(view);

// Click event for the add to supplier auth button
$('#assignphotos').click(function () {

  

// Array of record IDs
var record_ids = [];
var runID = window.location.href.split('/')[window.location.href.split('/').length - 2];

// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/ecrm451p73bbgy6it4iu8iwpnpqh1vdf?recordid=" + record_ids + "&runID=" + runID;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length

setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
alert('Integromat is updating ' + selectedRecords + ' records. Depending on how many photos you are updating this could take a few minutes');
Knack.hideSpinner();P


})



});


$(document).on('knack-view-render.view_1378', function (event, view) {

// Add add to supplier Auth button
$('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="getTLSPhotos"">Get Photos from TLS WO</button>').insertAfter('#view_1378 > div.view-header > h2' );

// Click event for the add to supplier auth button
$('#getTLSPhotos').click(function () {

  
// Array of record IDs
var projectID = window.location.href.split('/')[window.location.href.split('/').length - 2];
var tlWO = prompt("What is the TLS WO ID?:");


commandURL = "https://hook.integromat.com/bp83h6wunhoa9oc2ubm5hwklbc8u775i?projectID=" + projectID + "&tlWO=" + tlWO;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;


setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
alert('Integromat is going to download photos from ' + tlWO + ' . Depending on how many photos there are it could take a moment for this to complete. ');
Knack.hideSpinner();P


})



});




//McGandy's Experiement //

// Run when edit quote page is loaded
$(document).on('knack-scene-render.scene_213', function(event, view, record){
setTimeout(function(){

//ubcontractor cost is populated
$('input#field_1364').change(function() { // When the subcontractor cost is changed
  var subcontractor_cost = $(this).val(); // Get the value of the subcontractor cost
  var survey_cost = document.querySelector('input#field_1363').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
  var margin = document.querySelector('input#field_1365').value;
  var marked_up_labor = Math.round(total_cost / (1 - margin));

  var install_total = Knack.models['view_507'].toJSON().field_343.replaceAll(',','').replaceAll('$','');
  var fees_added = document.querySelector('input#field_1251').value.replaceAll(',','');
  var more_fees_to_add = Math.round((marked_up_labor - install_total) + Math.round(fees_added));


$('input#field_1366').val(marked_up_labor); // Update the marked up labor field to reflect costs + margin
$('input#field_1580').val(more_fees_to_add); // Update the marked up labor field to reflect costs + margin
});


//survey cost is populated
$('input#field_1363').change(function() { // When the survey cost is changed
  var survey_cost = $(this).val(); // Get the value of the survey cost
  var subcontractor_cost = document.querySelector('input#field_1364').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
  var margin = document.querySelector('text#field_1365').value; // get the value from margin field
  var marked_up_labor = Math.round(total_cost / (1 - margin)); // calculate marked up labor
 
$('input#field_1366').val(marked_up_labor); // Update the marked up labor field to reflect costs + margin
$('input#field_1365').keyup(); 

});


//Sets margin when the marked_up_labor cost field is populated...
$('input#field_1366').change(function() { // When the marked up labor cost field is changed
  var marked_up_labor = $(this).val(); // Get the new marked_up_labor_cost
  var survey_cost = document.querySelector('input#field_1363').value;
  var subcontractor_cost = document.querySelector('input#field_1364').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost))
  var margin = Math.abs(Math.round(marked_up_labor - total_cost) / marked_up_labor);
  var margin_rounded = Math.round((margin + Number.EPSILON) * 100) / 100;
  
$('input#field_1365').val(margin_rounded); // Update the margin value
$('input#field_1365').keyup(); 


});


//when the margin field is populated...
$('input#field_1365').change(function() { // When the margin field is changed
  var margin = $(this).val(); // Get the value of the margin field
  var survey_cost = document.querySelector('input#field_1363').value;
  var subcontractor_cost = document.querySelector('input#field_1364').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost))
  var marked_up_labor = Math.round(total_cost / (1 - margin))

$('input#field_1366').val(marked_up_labor); // Update the value of the second input
$('input#field_1366').keyup();
});


},1); //set timeout value
});

/*// Set Trigger field to Triad Branch for Traid Site Visit Booking
$(document).on('knack-scene-render.scene_213', function(event, view, record){
setTimeout(function(){


});

},1); //set timeout value
}); */


/*$('#input1').change(function() { // When the first input is changed
  var input1Value = $(this).val(); // Get the value of the first input
  $('#input2').val(input1Value); // Update the value of the second input
})


/*
// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-scene-render.scene_213', function(event, view, record){
setTimeout(function(){

    var test = data.field_1363;

  
$('#input1').change(function() { // When the first input is changed
  var input1Value = $(this).val(); // Get the value of the first input
  $('#input2').val(input1Value); // Update the value of the second input
})

  },1) //set timeout value
}); 
input#field_1363

  $('input#field_1363').on('change keydown paste input', function(){
      var test = $(this).val();
});

*/


/*

/CODE TO ADD COLUMN SELECTORS on views 158, 198, 196, 759

$(document).on('knack-view-render.view_2128', function(event, view, data) {
  addTableColumnChoose(view);
});
//for multiple tables: $(document).on('knack-view-render.view_289.view_1111.view_1118.view_1119', function(event, view, data) {addTableColumnChoose(view);});

var addTableColumnChoose = function(view) {
  //See http://helpdesk.knackhq.com/support/discussions/topics/5000074312 and https://jsfiddle.net/HvA4s/
  // added support for cookies to keep selected columns between renders and sessions
  var clearFix = $('#' + view.key + ' div.kn-records-nav');
    clearFix.append("
Filter Columns
");

  var hstring = getCookie("hstring_"+view.key);
  if (hstring != ''){
    var headers = JSON.parse(hstring);
           $.each(headers, function(i, show) {
                var cssIndex = i + 1;
                var tags = $('#' + view.key + '  table th:nth-child(' + cssIndex + '), #' + view.key + '  table td:nth-child(' + cssIndex + ')');
                if (show)
                    tags.show();
                else
                    tags.hide();
               
            });
  }
 
    $('#' + view.key + ' .choose-columns').click(function() {
      // remove other open columns set dialog on the same page
      if( $('#tableChooseColumns')!=null) {$('#tableChooseColumns').remove();}
        var headers = $('#' + view.key + ' table th').map(function() {
            var th =  $(this);
            return {text: th.text(), shown: th.css('display') != 'none'};
        });
      var hs;
      h = ['
'];
      $.each(headers, function() {
        h.push('');
        });
        h.push('
OK
 ',
               this.text,
               '
');
        hs = h.join('');

        $('body').append(hs);
        var pos = $('#' + view.key + ' .choose-columns').position();
      $('#tableChooseColumns').css({'position': 'absolute','left': '20px', 'top': pos.top,'padding': '5px', 'border': '1px solid #666', 'border-radius':'3px','background': '#fff'});
        $('#done').click(function() {
            var showHeaders = $('#tableChooseColumns input').map(function() { return this.checked; });
            var columns =[];
           $.each(showHeaders, function(i, show) {
                var cssIndex = i + 1;
                var tags = $('#' + view.key + ' table th:nth-child(' + cssIndex + '), #' + view.key + ' table td:nth-child(' + cssIndex + ')');
                if (show)
                    tags.show(300,"swing");
                else
                    tags.hide(300,"swing");
                columns.push(show);
            });
         
            $('#tableChooseColumns').remove();
            setCookie("hstring_"+view.key,JSON.stringify(columns),100);

          mixpanel.track("Preferences changes",{"Page":("Knack: "+view.scene.name), "View":view.title});
          return false;
        });
        return false;
    });
}

/* Cookie support -----------------------------------------------*/

/*

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i = 0; i 
                    




*/

$(document).on('knack-scene-render.scene_776', function (event, view, data) {
    $('').click(function () {
        $('#view_hide').show();
    });
});

/* Instructions Placement */


$(document).on('knack-view-render.form', function(event, view, data) {
  $("#" + view.key + " .kn-instructions").each(function() {
    //find the input label for this field
    var inputLabel = $(this).closest(".kn-input").find(".kn-label");
    //append the instructions for this field after the label
    $(this).insertAfter(inputLabel);
  });
});








/*

$(document).on('knack-scene-render.scene_915', function saveData() {
            const now = new Date();
            const item = {
                data: 'field_1630',
                expiry: now.getTime() + (30 * 24 * 60 * 60 * 1000), // Current time + 30 days in milliseconds
            };
            localStorage.setItem('cachedData', JSON.stringify(item));
            document.getElementById('cacheStatus').textContent = 'Data automatically saved to cache.';
        }
        function loadData() {
            const itemStr = localStorage.getItem('cachedData');
            if (!itemStr) {
                saveData(); // No data found, save new data
                return;
            }
            const item = JSON.parse(itemStr);
            const now = new Date();
            // Check if the data has expired
            if (now.getTime() > item.expiry) {
                localStorage.removeItem('cachedData'); // Clear expired data
                document.getElementById('cacheStatus').textContent = 'Cached data expired. Cache cleared.';
                saveData(); // Save new data since the old data expired
            } else {
                document.getElementById('cacheStatus').textContent = 'Cached data loaded: ' + item.data;
            }
        }
        // Load data from cache or save it if not present/expired
        loadData();


});


*/


/*


var autoRefreshViews = ['view_2833']; // Replace with your view keys

$(document).on('knack-cell-update.view_2830', function (event, view) {
    if (autoRefreshViews.includes(view.key)) {
        AutoRefresh(view.key, 5000);
    }
});

function AutoRefresh(viewId, ms) {
    setTimeout(function() {
//        Knack.views[viewId].model.fetch();
        AutoRefresh(viewId, ms);
    }, ms);
}


/*
// Change view_1 to the table view you want to listen to
$(document).on('knack-cell-update.view_2830', function(event, view, record) {
  // Do something after the inline edit
  alert('updated a record for table view: ' + view.key);
  Knack.views['view_2833'].model.fetch();
  $('input#field_365').keyup();

  
});
*/

/******** SUBMIT QUOTE DETAILS & DISCOUNTS FOMR TO FORCE REFRESH WHEN OTHER EQUIPMENT RECORDS UPDATED **************/


$(document).ready(function() {
   $(document).on('knack-cell-update.view_2830', function(event, view, record) {
       // Save the current scroll position
       var scrollPosition = $(window).scrollTop();
      
       // Trigger the form submission by clicking the button
       $('#view_2833 button[type=submit]').submit();

       // Restore the scroll position after a delay
       setTimeout(function() {
           // Alternatively, to scroll to the bottom of the page, use: $(document).scrollTop($(document).height());
           $(window).scrollTop(scrollPosition);
       }, 2000); // Adjust the delay as needed
   });
});

/*
$(document).ready(function() {
   $(document).on('knack-cell-update.view_2911', function(event, view, record) {
       // Do something after the inline edit
         $('#view_2833 button[type=submit]').submit();

   });
});
*/

/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO EQUIPMENT TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/
$(document).ready(function() {
   $(document).on('knack-cell-update.view_2911', function(event, view, record) {
       // Save the current scroll position
       var scrollPosition = $(window).scrollTop();

       // Re-render the Knack view
       Knack.router.scene_view.render();

       // Restore the scroll position after a delay
       setTimeout(function() {
           // Alternatively, to scroll to the bottom of the page, use: $(document).scrollTop($(document).height());
           $(window).scrollTop(scrollPosition);
       }, 2000); // Adjust the delay as needed
   });
});
/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO EQUIPMENT TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/




/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO DROPS TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/

$(document).ready(function() {
   $(document).on('knack-cell-update.view_2835', function(event, view, record) {
       // Save the current scroll position
       var scrollPosition = $(window).scrollTop();

       // Re-render the Knack view
       Knack.router.scene_view.render();

       // Restore the scroll position after a delay
       setTimeout(function() {
           // Alternatively, to scroll to the bottom of the page, use: $(document).scrollTop($(document).height());
           $(window).scrollTop(scrollPosition);
       }, 500); // Adjust the delay as needed
   });
});
/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO √ TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/



/*


$(document).ready(function() {
    // Variable to store the previous value of the specific field
    let previousFieldValue = null;

    $(document).on('knack-cell-update.view_2835', function(event, view, record) {
        // Replace 'specificFieldName' with the name of the field you want to monitor
        const currentFieldValue = record.field_60; // Change 'field_123' to your specific field ID

        // Check if the specific field has changed
        if (previousFieldValue !== currentFieldValue) {
            // Update the previous field value
            previousFieldValue = currentFieldValue;

            // Save the current scroll position
            var scrollPosition = $(window).scrollTop();

            // Re-render the Knack view
            Knack.router.scene_view.render();

            // Restore the scroll position after a delay
            setTimeout(function() {
                $(window).scrollTop(scrollPosition);
            }, 500); // Adjust the delay as needed
        }
    });
});



*/



$(document).ready(function () {
  let previousFieldValue = null;
  let scrolling = false;

  function scrollToView2835() {
    const $v = $("#view_2835");
    if (!$v.length) return false;

    const y = $v.offset().top; // top of the view in the page
    window.scrollTo(0, y);
    return true;
  }

  $(document).on("knack-cell-update.view_2835", function (event, view, record) {
    const currentFieldValue = record.field_60;

    if (previousFieldValue === null) previousFieldValue = currentFieldValue;
    if (previousFieldValue === currentFieldValue) return;

    previousFieldValue = currentFieldValue;

    if (scrolling) return;
    scrolling = true;

    Knack.router.scene_view.render();

    // Re-apply scroll a few times because Knack can change it during render
    requestAnimationFrame(() => {
      scrollToView2835();
      requestAnimationFrame(() => {
        scrollToView2835();
        setTimeout(() => {
          scrollToView2835();
          scrolling = false;
        }, 200);
      });
    });
  });
});



$(document).ready(function () {
  const watchedFields = ["field_128","field_129","field_301"]; // <-- add more: ["field_60","field_123","field_999"]

  // track last-seen values per record id
  const prevByRecordId = {};
  let scrolling = false;

  function scrollToView2835() {
    const $v = $("#view_2911");
    if (!$v.length) return false;

    const headerOffset = 0; // set if you have a fixed header
    const y = $v.offset().top - headerOffset;

    window.scrollTo(0, y);
    return true;
  }

  function getRecordId(record) {
    // Knack record id is usually on record.id
    return record && (record.id || record._id || record.record_id);
  }

  function snapshot(record) {
    const snap = {};
    watchedFields.forEach((f) => {
      snap[f] = record ? record[f] : undefined;
    });
    return snap;
  }

  function changed(prevSnap, nextSnap) {
    if (!prevSnap) return true; // first time we see this record
    return watchedFields.some((f) => prevSnap[f] !== nextSnap[f]);
  }

  $(document).on("knack-cell-update.view_2911", function (event, view, record) {
    const rid = getRecordId(record);
    if (!rid) return;

    const nextSnap = snapshot(record);
    const prevSnap = prevByRecordId[rid];

    // If none of the watched fields changed, do nothing
    if (!changed(prevSnap, nextSnap)) return;

    // Update our snapshot
    prevByRecordId[rid] = nextSnap;

    if (scrolling) return;
    scrolling = true;

    Knack.router.scene_view.render();

    // Re-apply scroll a few times because Knack can change it during render
    requestAnimationFrame(() => {
      scrollToView2835();
      requestAnimationFrame(() => {
        scrollToView2835();
        setTimeout(() => {
          scrollToView2835();
          scrolling = false;
        }, 250);
      });
    });
  });
});



/*

$(document).ready(function () {
  let busy = false;

  function scrollToView2835() {
    const $v = $("#view_2835");
    if (!$v.length) return;

    const headerOffset = 0; // set to 80–120 if you have a fixed header
    const y = $v.offset().top - headerOffset;

    window.scrollTo(0, y);
  }

  $(document).on("knack-cell-update.view_2835", function (event, view, record) {
    if (busy) return;
    busy = true;

    Knack.router.scene_view.render();

    // Knack may reset scroll multiple times during render — reapply it
    requestAnimationFrame(() => {
      scrollToView2835();
      requestAnimationFrame(() => {
        scrollToView2835();
        setTimeout(() => {
          scrollToView2835();
          busy = false;
        }, 200);
      });
    });
  });
});








/******** SUBMIT QUOTE DETAILS & DISCOUNTS FOMR TO FORCE REFRESH WHEN OTHER EQUIPMENT RECORDS UPDATED **************/
$(document).on('knack-view-render.view_2895', function(event, view, data) {
    if (document.querySelector('input#field_1747').value == "blank") {
        $("#view_2913").css("visibility", "hidden");
        $("#view_2913").css("height", "0px");
    }
    else {
    $("#view_2895").css("visibility", "hidden");
    $("#view_2895").css("height", "0px");
}
});


$(document).on('knack-view-render.view_2913', function(event, view, data) {
    $("#view_2914").css("visibility", "hidden");
    $("#view_2914").css("height", "0px");

});

$(document).on('knack-view-render.view_2895', function(event, view, data) {
    $("#view_2914").css("visibility", "hidden");
    $("#view_2914").css("height", "0px");
});


$(document).on('knack-form-submit.view_2895', function(event, view, record) {
    // Refresh the view and use a callback to ensure the condition runs after the fetch
    Knack.views["view_2914"].model.fetch({
        success: function() {
            // Only check the condition after the view is refreshed
            if (document.querySelector('input#field_1747').value != "blank") {
                $("#view_2913").css({
                    "visibility": "visible",
                    "height": "100%"
                });
            }
        }
    });
});



$(document).on('knack-view-render.view_2833', function(event, view, data) {
    $("#kn-input-field_1509").css("visibility", "hidden");
    $("#kn-input-field_1509").css("height", "0px");
});



$(document).on('knack-view-render.view_3094', function(event, view) {
    let fileInput = $('#' + view.key + ' input[type="file"]');

    fileInput.on('change', function () {
        if (this.files.length > 0) {
            // Wait for Knack to process the file upload before submitting
            setTimeout(function () {
                $(fileInput).closest('form').submit();
            }, 1000); // Delay to allow Knack to process file selection
        }
    });
});

//*********** EDIT PROPOSAL: PLAYBOOK ****************************** *//
$(document).on('keydown', function (event) {
    if (event.key === "Tab") {
        let focusedElement = document.activeElement;
        let targetFieldKey = "field_1802"; // Replace with the actual field key

        if (focusedElement && focusedElement.id.includes(targetFieldKey)) {
            event.preventDefault(); // Prevent default tab behavior
            $('.kn-button.is-primary').click(); // Simulate form submission
        }
    }
});


//*********** EDIT PROPOSAL: UPLOAD FILES, DO NOT REFRESH PARENT PAGE ****************************** *//

const targetSceneID = 'scene_1040'; // Your specific scene ID

$(document).on('click', '.delete.close-modal', function() {
    // Wait for the modal to fully close before checking
    setTimeout(() => {
        if ($(`#${targetSceneID}`).length === 0) {
            location.reload(); // Refresh parent page after modal closes
        }
    }, 500); // Small delay to ensure the modal has been removed
});






















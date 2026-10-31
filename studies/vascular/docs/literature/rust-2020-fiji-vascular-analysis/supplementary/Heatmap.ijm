// FIJI (IMAGEJ) GUIDE FOR VASCULAR ANALYSIS
// Ruslan Rust
// 03/10/2019

/* Optional you can specify the heatmap luts to have the colors as you like, I am using the hm_stroke lut that is attached as a file  
 document. The file needs to be added to the file directionary Fiji/luts  */


//PRE-PROCESSING
run("Duplicate...", "duplicate"); // dublicate image, to keep the raw image
run("8-bit");  // alternatively use 16 bit 
//run("Z Project...", "projection=[Max Intensity]"); //if necessaery MAX Projections
run("Median...", "radius=1"); // remove noise, radius can be adjusted

//BINARIZED IMAGE 
// either use AutoThreshold or adjust manually with setThredhold
//setAutoThreshold("Default dark");
setThreshold(66, 255); // this should be adapted to your image!! 
run("Convert to Mask");
run("Analyze Particles...", "size=20-Infinity show=Masks"); //remove small artefacts


run("Set Measurements...", "area mean centroid kurtosis area_fraction display redirect=None decimal=6");
image=getTitle();
getDimensions(width, height, channels, slices, frames);
run("Duplicate...", "title=HM.tif");



numRow = 15; // number of squared for heatmap, can be adapted to image size
numCol = numRow;

width = width/numRow
height = height/numCol

setBatchMode(true);
for(i = 0; i < numRow; i++)
{
	for(j = 0; j < numCol; j++)
	{
		xOffset = i * (width);
		//print(xOffset);
		yOffset = j * (height);
		//print(yOffset);
		selectWindow("HM.tif");
		makeRectangle(xOffset,yOffset, width, height);
		roiManager("Add");
		run("Measure");
		meanwert = getResult("Mean");
		meanwert_real= 255-meanwert;
		//meanwert_real= meanwert;
 		

		
		
		
		setForegroundColor(meanwert_real,meanwert_real,meanwert_real);
		test = getValue("color.foreground");
		
		run("Fill");
		
	}		
}

/* this is my own lut hm_stroke, I have used for previous studies but you can also use any from imageJ */
// you need to add the lut file into folder Fiji.app/luts
//run("hm_stroke"); 

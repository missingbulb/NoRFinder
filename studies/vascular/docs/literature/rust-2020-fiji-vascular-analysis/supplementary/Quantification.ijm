// FIJI (IMAGEJ) GUIDE FOR VASCULAR ANALYSIS
// Ruslan Rust
// 03/10/2019

/* Before Starting you will need to install two packages to perform the analysis   
 *  Package 1: Measure Skeleton Length: 
 *  Link: dev.mri.cnrs.fr/attachments/download/1487/Measure_Skeleton_Length_Tool.ijm
 *  Save the document under ImageJ/plugins/ 
 *  
 *  Package 2: NND: Nearest neighbor distance
 *  Link: https://icme.hpc.msstate.edu/mediawiki/images/9/9a/Nnd_.class
 *  Save the file in  ImageJ/Plugins/Analyze
 */ 



//PRE-PROCESSING
run("Duplicate...", "duplicate"); // dublicate image, to keep the raw image
run("8-bit");  // alternatively use 16 bit 
//run("Z Project...", "projection=[Max Intensity]"); //if necessaery MAX Projections
run("Median...", "radius=1"); // remove noise, radius can be adjusted

//BINARIZED IMAGE 
// either use AutoThreshold or adjust manually with setThredhold
//setAutoThreshold("Default dark");
setThreshold(66, 255);
run("Convert to Mask");
run("Analyze Particles...", "size=20-Infinity show=Masks"); //remove small artefacts



// Analyze all parameters seperately, start always from binary image
// The parameters presented here are: Area fraction, Vascular length, Vascular branching, Nearest neighbor distance


 
//1 Area fraction
run("Set Measurements...", "area mean min centroid perimeter area_fraction redirect=None decimal=2");
run("Measure");

//2 Vascular length
run("Set Measurements...", "area mean min centroid perimeter area_fraction redirect=None decimal=2");
run("Duplicate...", " ");
run("Skeletonize");
run("Measure Skeleton Length Tool"); // Install this pplugin! 

//3 Vascular branches 
run("Set Measurements...", "area_fraction area mean min centroid perimeter redirect=None decimal=2");
run("Duplicate...", " ");
run("Skeletonize");
run("Analyze Skeleton (2D/3D)", "prune=none show");
// you get as a result many parameters including Number of junctions, branches, branch length etc.
// Detailed information you can find under: https://imagej.net/AnalyzeSkeleton

//4 Nearest neighbor distance
run("Put Behind [tab]");
run("Set Measurements...", "area centroid kurtosis area_fraction display redirect=None decimal=6");
run("Analyze Particles...", "size=20-Infinity show=Nothing display");
run("Nnd ");
// you get the distance between single vessel segments, it is possible to calculate mean or standard deviation from those data


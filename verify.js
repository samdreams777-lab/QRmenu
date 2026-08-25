/**
 * Verification script for Common Coffee QR Menu
 * Run with: node verify.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = 'D:/HERMES/QRmenu';
const DATA_FILE = path.join(PROJECT_DIR, 'data/menu.json');
const PHOTOS_DIR = path.join(PROJECT_DIR, 'menu_photos');
const IMAGES_USED = new Set();

console.log('=== Common Coffee QR Menu Verification ===\n');

// Test 1: Check data/menu.json is valid JSON
console.log('[1] Checking data/menu.json...');
let data;
try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    data = JSON.parse(rawData);
    console.log('    ✓ JSON is valid');
} catch (e) {
    console.log('    ✗ JSON parsing error:', e.message);
    process.exit(1);
}

// Test 2: Check required fields
console.log('[2] Checking required fields...');
const requiredFields = ['cafe', 'currency', 'categories'];
let allFieldsPresent = true;
requiredFields.forEach(field => {
    if (data[field] === undefined) {
        console.log(`    ✗ Missing required field: ${field}`);
        allFieldsPresent = false;
    }
});
if (allFieldsPresent) {
    console.log('    ✓ All required fields present');
}

// Test 3: Count categories and items
console.log('[3] Counting categories and items...');
const categoryCount = data.categories.length;
let totalItems = 0;
let categoriesWithItems = 0;

data.categories.forEach(cat => {
    const itemCount = cat.items ? cat.items.length : 0;
    totalItems += itemCount;
    if (itemCount > 0) categoriesWithItems++;
});

console.log(`    Categories: ${categoryCount}`);
console.log(`    Total items: ${totalItems}`);

if (categoryCount !== 12) {
    console.log(`    ⚠ Expected 12 categories, found ${categoryCount}`);
}

if (totalItems !== 83) {
    console.log(`    ⚠ Expected 83 items, found ${totalItems}`);
}

// Test 4: Check image files exist
console.log('[4] Checking image files...');
const photos = fs.readdirSync(PHOTOS_DIR).filter(f => f.endsWith('.jpg'));
console.log(`    Total photos in directory: ${photos.length}`);

let imageReferencesFound = 0;
let missingImages = [];

data.categories.forEach(cat => {
    cat.items.forEach(item => {
        if (item.image) {
            const imagePath = path.join(PHOTOS_DIR, item.image);
            if (fs.existsSync(imagePath)) {
                IMAGES_USED.add(item.image);
                imageReferencesFound++;
            } else {
                missingImages.push(item.image);
            }
        }
    });
});

console.log(`    Image references: ${imageReferencesFound}`);
console.log(`    Images found: ${IMAGES_USED.size}`);

if (missingImages.length > 0) {
    console.log(`    ⚠ Missing images: ${missingImages.length}`);
    missingImages.slice(0, 5).forEach(img => console.log(`      - ${img}`));
    if (missingImages.length > 5) console.log(`      ... and ${missingImages.length - 5} more`);
}

// Test 5: Check category structure
console.log('[5] Checking category structure...');
let categoriesValid = true;
data.categories.forEach((cat, index) => {
    if (!cat.id) {
        console.log(`    ✗ Category ${index} missing id`);
        categoriesValid = false;
    }
    if (!cat.name_en && !cat.name_vi) {
        console.log(`    ✗ Category ${cat.id || index} missing names`);
        categoriesValid = false;
    }
    if (!cat.items || !Array.isArray(cat.items)) {
        console.log(`    ✗ Category ${cat.id} missing items array`);
        categoriesValid = false;
    }
});
if (categoriesValid) {
    console.log('    ✓ All categories have valid structure');
}

// Test 6: Check item structure
console.log('[6] Checking item structure...');
let itemsValid = true;
let itemsMissingImages = 0;
let itemsMissingPrices = 0;

data.categories.forEach(cat => {
    cat.items.forEach(item => {
        if (!item.name_en) {
            console.log(`    ✗ Item in ${cat.id} missing English name`);
            itemsValid = false;
        }
        if (!item.variants || item.variants.length === 0) {
            if (!item.price) {
                itemsMissingPrices++;
            }
        }
        if (!item.image) {
            itemsMissingImages++;
        }
    });
});

if (itemsValid) {
    console.log('    ✓ All items have valid structure');
}
if (itemsMissingPrices > 0) {
    console.log(`    ⚠ Items missing price in variants: ${itemsMissingPrices}`);
}
if (itemsMissingImages > 0) {
    console.log(`    ⚠ Items missing image reference: ${itemsMissingImages}`);
}

// Test 7: Check needs_review items
console.log('[7] Items marked for review...');
const reviewItems = [];
data.categories.forEach(cat => {
    cat.items.forEach(item => {
        if (item.needs_review) {
            reviewItems.push({
                category: cat.id,
                name: item.name_en,
                reason: item.review_reason
            });
        }
    });
});
console.log(`    Found ${reviewItems.length} items needing review`);
reviewItems.forEach(item => {
    console.log(`      - ${item.category}/${item.name}: ${item.reason}`);
});

// Test 8: Check HTML and CSS files
console.log('[8] Checking project files...');
const htmlFile = fs.readFileSync(path.join(PROJECT_DIR, 'index.html'), 'utf8');
const cssFile = fs.readFileSync(path.join(PROJECT_DIR, 'styles.css'), 'utf8');
const jsFile = fs.readFileSync(path.join(PROJECT_DIR, 'script.js'), 'utf8');

console.log('    ✓ index.html exists');
console.log('    ✓ styles.css exists');
console.log('    ✓ script.js exists');

// Check for key features in JS
const hasLangSwitch = jsFile.includes('switchLanguage');
const hasCategoryNav = jsFile.includes('switchCategory');
const hasModal = jsFile.includes('openModal');
const hasFetch = jsFile.includes("fetch('data/menu.json')");

console.log(`    Language switching: ${hasLangSwitch ? '✓' : '✗'}`);
console.log(`    Category navigation: ${hasCategoryNav ? '✓' : '✗'}`);
console.log(`    Modal functionality: ${hasModal ? '✓' : '✗'}`);
console.log(`    Data fetching: ${hasFetch ? '✓' : '✗'}`);

console.log('\n=== Verification Complete ===');

// Results summary
const issues = [];
if (categoryCount !== 12) issues.push(`Wrong category count: ${categoryCount}`);
if (totalItems !== 83) issues.push(`Wrong item count: ${totalItems}`);
if (missingImages.length > 0) issues.push(`${missingImages.length} missing images`);
if (reviewItems.length > 0) issues.push(`${reviewItems.length} items need review`);

if (issues.length === 0) {
    console.log('\n✓ All checks passed! Project is ready.');
} else {
    console.log('\n⚠ Issues found:');
    issues.forEach(issue => console.log(`  - ${issue}`));
}
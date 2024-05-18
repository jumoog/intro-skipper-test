const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { URL } = require('url');

// Read manifest.json
const manifestPath = './manifest.json';
if (!fs.existsSync(manifestPath)) {
    console.error('manifest.json file not found');
    process.exit(1);
}
const jsonData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function validateJSON(data) {
    for (const item of data) {
        for (const version of item.versions) {
            console.log(`Validating version ${version.version}...`);

            const isValidUrl = await checkUrl(version.sourceUrl);
            if (!isValidUrl) {
                console.error(`Invalid URL: ${version.sourceUrl}`);
                process.exit(1); // Exit with an error code
            }

            const isValidChecksum = await verifyChecksum(version.sourceUrl, version.checksum);
            if (!isValidChecksum) {
                console.error(`Checksum mismatch for URL: ${version.sourceUrl}`);
                process.exit(1); // Exit with an error code
            } else {
                console.log(`Version ${version.version} is valid.`);
            }
        }
    }
}

function checkUrl(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            resolve(res.statusCode === 302);
        }).on('error', () => {
            resolve(false);
        });
    });
}

async function verifyChecksum(url, expectedChecksum) {
    const tempFilePath = `tempfile_${Math.random().toString(36).substring(2, 15) + Math.random().toString(23).substring(2, 5)}.zip`;

    try {
        await downloadFile(url, tempFilePath);
        const fileBuffer = fs.readFileSync(tempFilePath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        fs.unlinkSync(tempFilePath); // Clean up temp file
        return hash === expectedChecksum;
    } catch (error) {
        console.error(`Error verifying checksum for URL: ${url}`, error);
        return false;
    }
}

async function downloadFile(url, destinationPath, redirects = 5) {
    if (redirects === 0) {
        throw new Error('Too many redirects');
    }

    const file = fs.createWriteStream(destinationPath);

    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Follow redirect
                const redirectUrl = new URL(response.headers.location, url).toString();
                downloadFile(redirectUrl, destinationPath, redirects - 1)
                    .then(resolve)
                    .catch(reject);
            } else if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            } else {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }
        }).on('error', (err) => {
            fs.unlink(destinationPath, () => reject(err));
        });
    });
}

// Run the validation
validateJSON(jsonData).then(() => console.log('Validation complete.'));

/**
 * OPML Import/Export logic for Retrofeed
 */

export function exportToOPML(subscriptions) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
    <head>
        <title>Retrofeed Subscriptions</title>
        <dateCreated>${new Date().toUTCString()}</dateCreated>
    </head>
    <body>
        <outline text="Podcasts" title="Podcasts">
`;

    subscriptions.forEach(sub => {
        const title = sub.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const url = sub.url.replace(/&/g, '&amp;');
        xml += `            <outline type="rss" text="${title}" title="${title}" xmlUrl="${url}" />
`;
    });

    xml += `        </outline>
    </body>
</opml>`;

    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'retrofeed_subscriptions.opml';
    a.click();
    URL.revokeObjectURL(url);
}

export async function importFromOPML(file) {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    const outlines = Array.from(xmlDoc.querySelectorAll('outline[xmlUrl]'));
    return outlines.map(node => ({
        title: node.getAttribute('title') || node.getAttribute('text') || 'Untitled Podcast',
        url: node.getAttribute('xmlUrl')
    }));
}

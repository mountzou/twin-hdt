const styleMarker = {
    size: 2,
    shape: 'square',
};

const styleStroke = {
    curve: 'monotoneCubic',
    width: 2,
    dashArray: 0,
    lineCap: 'butt',
}

const styleAxis = {
    fontSize: '14px',
    fontFamily: 'Nunito Sans, sans-serif',
    fontWeight: 600,
    offsetX: 30
};

const styleTicks = {
    fontSize: '12px',
    fontFamily: 'Nunito Sans, sans-serif',
    fontWeight: 500,
    offsetX: 30
};

const styleTooltip = {
    shared: true,
    intersect: false,
    fillSeriesColor: false,
    y: {
        formatter: function(y) {
            if (typeof y !== "undefined") {
                return y.toFixed(0) + " " + pollutantUnit;
            }
            return y;
        },
        style: styleAxis
    }
};

const styleToolbar = {
    show: true,
    offsetX: 0,
    offsetY: 0,
    tools: {
        download: true,
        selection: false,
        zoom: false,
        zoomin: false,
        zoomout: false,
        pan: false,
        reset: false | '<img src="/static/icons/reset.png" width="20">',
        customIcons: []
    },
    export: {
        csv: {
            filename: undefined,
            columnDelimiter: ',',
            headerCategory: 'category',
            headerValue: 'value',
            dateFormatter(timestamp) {
                return new Date(timestamp).toDateString()
            }
        },
        svg: {
            filename: undefined,
        },
        png: {
            filename: undefined,
        }
    },
    autoSelected: 'zoom'
};
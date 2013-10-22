/*
 * @title WET-BOEW Multimedia PLayer
 * @overview An accessible multimedia player for <audio> and <video> tags, including a Flash fallback
 * @license wet-boew.github.io/wet-boew/License-en.html / wet-boew.github.io/wet-boew/Licence-fr.html
 * @author WET Community
 */

(function( $, window, document, vapour, undef ) {
"use strict";

/* Local scoped variables*/
var $document = $(document),
	$selector = ".wb-mltmd",
	$seed = 0,
	$templatetriggered = false,
	$lang = document.documentElement.lang,
	formatTime, parseTime, expand, load_captions_external, load_captions_internal,
	parseHtml, parseXml, playerapi, update_captions;

/* helper functions*/

/*
@method formatTime
@description format a number of seconds to SMTPE Timecode format (HH:MM:SS.FF)
@param {Float} time The time to format
@returns {String} the formatted time
*/
formatTime = function( time ) {
	var index = 2, timecode = "",
		secondsIn, current, pad;

	pad = function( number, digits ) {
		return new Array( Math.max( digits - String( number ).length + 1, 0 ) ).join( 0 ) + number;
	};

	time = Math.floor( time );

	//Loop to extract hours, minutes and seconds
	while (index >= 0) {
		secondsIn = Math.pow( 60, index ); //Get the number of seconds for the current iteration (hour, minute or second)
		current = Math.floor( time / secondsIn );

		if ( timecode !== "" ) {
			timecode += ":";
		}

		timecode += pad( current, 2 );
		time -= secondsIn * current;
		index -= 1;
	}
	return timecode;
};

/*
@method parseTime
@description parse an SMTPE Timecode string (HH:MM:SS.FF) or duration (45s) and returns the number of seconds for the timecode
@param {String} time The timecode or duration string to parse
@returns {Float} the number of seconds in time
*/
parseTime = function( time ) {
	var p, parts, timeStringPortion, _partLength, seconds;

	if ( time !== undef ) {
		if ( time.charAt( time.length - 1 ) === "s" ) {
			//Duration parsing
			return parseFloat( time.substring( 0, time.length - 1 ) );
		} else {
			//SMTPE Timecode Parsing
			parts = time.split( ":" ).reverse();
			seconds = 0;

			for (p = 0, _partLength = parts.length; p < _partLength; p += 1 ) {
				timeStringPortion = p === 0 ?
					parseFloat( parts[ p ] ) :
					parseInt( parts[ p ], 10 );
				seconds += timeStringPortion * Math.pow( 60, p );
			}
			return seconds;
		}
	}
	return -1;
};

expand = function( elm, withPlayer ) {
	var $this = $( elm ),
		$data = $this.data( "properties" );

	return withPlayer !== undef ?
		 [ $this, $data, $data.player ] :
		 [ $this, $data ];
};


/*
@method parseHtml
@description parse an HTML fragment and extract embed captions
@param {String} content The HTML fragment containing the captions
@returns {Array} An array of captions objects (ex: {text: "Caption", begin: 0, end :10})
*/
parseHtml = function( content ) {
	var captions = [],
		captionSelector = ".wb-tmtxt",
		captionElements = content.find( captionSelector ),
		_len = captionElements.length,
		_i, captionElement, json, begin, end;

	for ( _i = 0; _i !== _len; _i += 1 ) {
		captionElement = captionElements[ _i ];
		begin = -1;
		end = -1;

		if ( captionElement.attr("data-begin") !== undef ) {
			begin = parseTime( captionElement.attr( "data-begin" ) );
			end = captionElement.attr( "data-end" ) !== undef ?
				parseTime( captionElement.attr( "data-end" ) ) :
				parseTime( captionElement.attr( "data-dur" ) ) + begin;
		} else if (captionElement.attr("data") !== undef) {
			json = captionElement.attr("data")
				.replace( /(begin|dur|end)/g, "\"$1\"" )
				.replace( /'/g, "\"" );
			json = $.parseJSON(json);
			begin = parseTime( json.begin );
			end = json.end !== undefined ?
				parseTime( json.end ) :
				parseTime( json.dur ) + begin;
		}

		//Removes nested captions if an
		captionElement = captionElement.clone();
		captionElement.find(captionSelector).detach();

		captions[ captions.length ] = {
				text: captionElement.html(),
				begin: begin,
				end: end
		};
	}

	return captions;
};

/*
@method parseXml
@description parse an TTML (Xml) document and extract captions
@param {String} content The TTML fragment containing the captions
@returns {Array} An array of captions objects (ex: {text: "Caption", begin: 0, end :10})
*/
parseXml = function( content ) {
	var captions = [],
		captionSelector = "[begin]",
		captionElements = content.find( captionSelector ),
		_len = captionElements.length,
		_i, captionElement, begin, end;

	for ( _i = 0; _i !== _len; _i += 1 ) {
		captionElement = captionElements[ _i ];
		begin = parseTime( captionElement.attr( "begin" ) );
		end = captionElement.attr("end") !== undef ?
			parseTime(captionElement.attr("end")) :
			parseTime(captionElement.attr("dur")) + begin;

		
		captionElement = captionElement.clone();
		captionElement.find( captionSelector ).detach();

		return captions[ captions.length ] = {
			text: captionElement.html(),
			begin: begin,
			end: end
		};
	}
	return captions;
};

load_captions_external = function( elm, url ) {
	return $.ajax({
		url: url,
		// FIXME: Where is "evtmgr" from?
		context: evtmgr,
		dataType: "html",
		dataFilter: function( data ) {
			return data.replace( /<img [^>]*>/g, "" );
		},
		success: function( data ) {
			return $( elm ).trigger({
				type: "captionsloaded.mediaplayer.wb",
				captions: data.indexOf( "<html" ) !== -1 ?
					parseHtml( $( data ) ) :
					parseXml( $( data ) )
			});
		},
		error: function( response, textStatus, errorThrown ) {
			return $( elm ).trigger({
				type: "captionsloadfailed.mediaplayer.wb",
				error: errorThrown
			});
		}
	});
};

load_captions_internal = function( elm, obj ) {
	return $( elm ).trigger({
		type: "captionsloaded.mediaplayer.wb",
		captions: parseHtml( obj )
	});
};

update_captions = function( area, seconds, captions ) {
	var caption, counter, _clen,
		_results = [];

	area.empty();

	for ( counter = 0, _clen = captions.length; counter < _clen; ) {
		caption = captions[ counter ];
		if ( seconds >= caption.begin && seconds <= caption.end ) {
			area.append( $( "<div>" + caption.text + "</div>" ) );
		}
		_results.push( counter += 1 );
	}
	return _results;
};
playerapi = function( fn, args ) {
	var $this, captionsArea, method;

	switch ( fn ) {
	case "play":
		try {
			return this.object.play();
		} catch ( ex ) {
			return this.object.doPlay();
		}
		break;
	case "pause":
		try {
			return this.object.pause();
		} catch ( ex ) {
			return this.object.doPause();
		}
		break;
	case "getCaptionsVisible":
		return $( this ).find( ".wb-mm-captionsarea" ).is( ":visible" );
	case "setCaptionsVisible":
		$this = $( this );
		captionsArea = $this.find( ".wb-mm-captionsarea" );
		if ( args ) {
			captionsArea.show();
		} else {
			captionsArea.hide();
		}
		return $this.trigger( "captionsvisiblechange.mediaplayer.wb" );
	case "setPreviousTime":
		return this.object.previousTime = args;
	case "setBuffering":
		return this.object.buffering = args;
	default:
		method = fn.charAt( 3 ).toLowerCase() + fn.substr( 4 );
		switch ( fn.substr( 0, 3 ) ) {
		case "get":
			return typeof this.object[ method ] !== "function" ?
				this.object[ method ] :
				this.object[ method ]();
		case "set":
			return typeof this.object[ method ] !== "function" ?
				this.object[ method ] = args :
				this.object[ fn ]( args );
		}
	}
};

$document.on( "timerpoke.wb", $selector, function() {
	window._timer.remove( $selector );

	if ( !$templatetriggered ) {
		$templatetriggered = true;
		return $document.trigger({
			type: "ajax-fetch.wb",
			element: $( $selector ),
			fetch: "" + vapour.getPath( "/assets" ) + "/mediacontrol-" + $lang + ".txt"
		});
	}
});

$document.on( "ajax-fetched.wb", $selector, function( event ) {
	var $this = $( this ),
		$template = event.pointer.html();

	$this.data( "template", $template );
	return $this.trigger({
		type: "init.mediaplayer.wb"
	});
});

$document.on( "init.mediaplayer.wb", $selector, function() {
	var $this = $( this ),
		$id = $this.attr( "id" ) !== undef ? $this.attr( "id" ) : "wb-mediaplayer-" + ( $seed++ ),
		$media = $this.children( "audio, video" ).eq( 0 ),
		$m_id = $media.attr( "id" ) !== undef ? $media.attr( "id" ) : "" + $id + "-media",
		$type = $media.is( "video" ) ? "video" : "audio",
		$width = $type === "video" ? $media.attr( "width" ) : "0",
		$height = $type === "video" ? $media.attr( "height" ) : "0",
		$captions = $media.children("track[kind='captions']") ? $media.children("track[kind='captions']").attr("src") : undef,
		data = {
			id: $id,
			media: $media,
			m_id: $m_id,
			type: $type,
			height: $height,
			width: $width,
			captions: $captions,
			object: ""
		};

	if ( $media.attr( "id" ) === undef ) {
		$media.attr( "id", $m_id );
	}

	$this.data( "properties", data );

	if ( $media.get( 0 ).error === null && $media.get( 0 ).currentSrc !== "" && $media.get( 0 ).currentSrc !== undef ) {
		return $this.trigger( "" + $type + ".mediaplayer.wb" );
	} else {
		return $this.trigger( "fallback.mediaplayer.wb" );
	}

	// FIXME: This is unreachable
	return $.error( "[web-boew] Mediaplayer :: error - mp003 :: Cannot play listed media" );
});

$document.on( "fallback.mediaplayer.wb", $selector, function() {
	var _ref = expand( this ),
		$this = _ref[ 0 ],
		$data = _ref[ 1 ],
		$media = $data.media,
		$poster = $media.attr( "poster" ),
		$source = $data.media.find( "source" ),
		$playerresource;


	$data.flashvars = "id=" + $data.id;
	$playerresource = vapour.getPath( "/assets" ) + "/multimedia.swf?" + $data.flashvars;
	$data.poster = "";
	if ( $data.type === "video" ) {
		$data.poster = "<img src='" + $poster + " class='img-responsive' height='" +
			$data.height + "' width='" + $data.width + "' alt='" + $media.attr( "title" ) + "'/>";
		$data.flashvars = "&height=" + $media.height() + "&width=" +
			$media.width() + "&posterimg=" +
			encodeURI( vapour.getUrlParts( $poster ).absolute ) + "&media=" +
			encodeURI( vapour.getUrlParts( $source.filter( "[type='video/mp4']" ).attr( "src" ) ).absolute );
	} else {
		$data.flashvars = "&media=" + encodeURI( vapour.getUrlParts( $source.filter( "[type='audio/mp3']" ).attr( "src" ) ).absolute );
	}
	$data.sObject = "<object id='" + $data.m_id + "' width='" + $data.width +
		"' height='" + $data.height + "' class='" + $data.type +
		"' type='application/x-shockwave-flash' data='" +
		$playerresource + "' tabindex='-1'>" +
		"<param name='movie' value='" + $playerresource + "'/>" +
		"<param name='flashvars' value='" + $data.flashvars + "'/>" +
		"<param name='allowScriptAccess' value='always'/>" +
		"<param name='bgcolor' value='#000000'/>" +
		"<param name='wmode' value='opaque'/>" +
		$data.poster + "</object>";
	$this.data( "properties", $data );

	return $this.trigger( "wb.mediaplayer.renderui" );
});

$document.on( "video.mediaplayer.wb", $selector, function() {
	var _ref = expand( this ),
		$this = _ref[ 0 ],
		$data = _ref[ 1 ];

	$data.sObject = $data.media.wrap( "<div />" ).parent().html();
	$data.poster = "<img src='" + $data.media.attr( "poster" ) +
		"' class='img-responsive' height='" + $data.height +
		"' width='" + $data.width + "' alt='" + $data.media.attr( "title" ) + "'/>";

	$this.data( "properties", $data );

	return $this.trigger( "renderui.mediaplayer.wb" );
});

//FIXME: Not sure what was supposed to be going on here
$document.on("audio.mediaplayer.wb", $selector, function() {
	var $data, $this, _ref;
	return _ref = expand(this), $this = _ref[0], $data = _ref[1], _ref;
});

$document.on("renderui.mediaplayer.wb", $selector, function() {
	var _ref = expand( this ),
		$this = _ref[ 0 ],
		$data = _ref[ 1 ],
		$player;

	// FIXME: Where is "tmpl" defined?
	$this.html( tmpl( $this.data( "template" ), $data ) );
	$player = $( "#" + $data.m_id );
	$data.player = $player.is( "object") ? $player.children( ":first-child" ) : $player.load();

	$data.player.on( "durationchange play pause ended volumechange timeupdate captionsloaded captionsloadfailed captionsvisiblechange waiting canplay progress", function( event ) {
		return $this.trigger( event );
	});

	this.object = $player.get( 0 );
	this.player = playerapi;
	return $this.data( "properties", $data );
});

/*
UI Bindings
*/

$document.on( "click", $selector, function( event ) {
	var $target = $( event.target );

	if (event.which === 2 || event.which === 3) {
		return false;
	}

	if ( $target.hasClass( "playpause" ) || $target.is( "object" ) || $target.hasClass( "wb-mm-overlay" )) {
		this.player( this.player( "getPaused" ) ? "play" : "pause" );
	} else if ( $target.hasClass( "cc" ) ) {
		this.player( "setCaptionsVisible", !this.player( "getCaptionsVisible") );
	} else if ($target.hasClass( "mute" ) ) {
		this.player( "setMuted", !this.player( "getMuted" ) );
	} else if ( $target.is( "progress" ) || $target.hasClass( "wb-progress-inner") || $target.hasClass( "wb-progress-outer" ) ) {
		this.player( "setCurrentTime", this.player( "getDuration" ) * ( ( event.pageX - $target.offset().left ) / $target.width() ) );
	} else if ( $target.hasClass( "rewind" ) ) {
		this.player( "setCurrentTime", this.player( "getCurrentTime" ) - this.player( "getDuration" ) * 0.05);
	} else if ( $target.hasClass( "fastforward" ) ) {
		this.player( "setCurrentTime", this.player( "getCurrentTime" ) + this.player( "getDuration" ) * 0.05);
	}

	return true;
});
$document.on( "keydown", $selector, function( event ) {
	var _ref = expand( this ),
		$this = _ref[ 0 ],
		volume = 0;

	if ( ( event.which === 32 || event.which === 13 ) && event.target === this.player) {
		$this.find( ".wb-mm-controls .playpause" ).click();
	} else if ( event.keyCode === 37 ) {
		$this.find( ".wb-mm-controls .rewind ").click();
	} else if ( event.keyCode === 39 ) {
		$this.find( ".wb-mm-controls .fastforward" ).click();
	} else if ( event.keyCode === 38 ) {
		volume = Math.round( this.player.getVolume() * 10) / 10 + 0.10;
		volume = (volume < 1 ? volume : 1);
		this.player.setVolume( volume );
	} else if ( event.keyCode === 40 ) {
		volume = Math.round( this.player.getVolume() * 10 ) / 10 - 0.1;
		volume = ( volume > 0 ? volume : 0 );
		this.player.setVolume( volume );
	} else {
		return true;
	}
	return false;
});

$document.on("durationchange play pause ended volumechange timeupdate captionsloaded captionsloadfailed captionsvisiblechange waiting canplay progress", $selector, function( event ) {
	var button,
		$this = $( this );

	switch (event.type) {
	case "play":
		this.player( "play" );
		$this.find( ".playpause .glyphicon" )
			.removeClass( "glyphicon-play" )
			.addClass( "glyphicon-pause" )
			.end()
			.attr( "title", button.data( "state-off" ));

		//TODO: Replace with class?
		$this.find( ".wb-mm-overlay img" ).css( "visibility", "hidden" );

		$this.find(".progress").addClass("active");
		break;
	case "pause":
		this.player( "pause" );
		$this.find( ".playpause .glyphicon" )
			.removeClass( "glyphicon-pause" )
			.addClass( "glyphicon-play" )
			.end()
			.attr( "title", button.data( "state-on" ) );

		$this.find( ".progress" ).removeClass( "active" );
		break;
	case "ended":
		$this.find( ".playpause .glyphicon" )
			.removeClass( "glyphicon-pause" )
			.addClass( "glyphicon-play" )
			.end()
			.attr( "title", button.data( "state-on" ) );
		$this.find(".wb-mm-overlay").css("visibility", "show" );
		break;
	case "volumechange":
		// TODO: Think can be optimized for the minfier with some ternaries
		button = $this.find( ".mute .glyphicon" );
		if ( this.player( "getMuted" ) ) {
			button.removeClass( "glyphicon-volume-up" )
				.addClass( "glyphicon-volume-off" )
				.end()
				.attr( "title" , button.data( "state-on" ) );
		} else {
			button.removeClass( "glyphicon-volume-off" )
				.addClass( "glyphicon-volume-up" )
				.end()
				.attr( "title", button.data( "state-off" ) );
		}
		break;
	case "timeupdate":
		$this.find( "progress" )
			.attr(
				"value",
				Math.round( this.player( "getCurrentTime" ) / this.player( "getDuration" ) * 1000 ) / 10
			);

		$this.find( ".wb-mm-timeline-current span:not(.wb-invisible)" )
			.text( formatTime( this.player( "getCurrentTime" ) ) );

		if ( $.data( event.target, "captions" ) !== undef ) {
			update_captions(
				$this.find( ".wb-mm-captionsarea" ),
				this.player( "getCurrentTime" ),
				$.data( event.target, "captions" )
			);
		}
		break;
	case "captionsloaded":
		$.data( event.target, "captions", event.captions );
		break;
	case "captionsloadfailed":
		$this.find( ".wb-mm-captionsarea" ).append( "<p>ERROR: WB0342</p>" );
		break;
	case "captionsvisiblechange":
		// TODO: Think can be optimized for the minfier with some ternarie
		button = $this.find( ".cc .glyphicon" );
		if ( this.player( "getCaptionsVisible" ) ) {
			button.attr( "title", button.data( "state-on" ) )
				.css( "opacity", "1" );
		} else {
			button.attr( "title", button.data( "state-off" ) )
				.css( "opacity", ".5" );
		}
	}

	// FIXME: Not sure what should actually be returned here
	return $document.on( "loadcaptions.mediaplayer.wb", $selector, function() {
		var $data, $this, _ref;
		return _ref = expand( this ), $this = _ref[0], $data = _ref[1], _ref;
	});
});

return window._timer.add( $selector );

})( jQuery, window, document, vapour, undefined );

document.onreadystatechange = function () {
  if (document.readyState === "interactive") renderApp();

  function renderApp() {
    var onInit = app.initialized();

    onInit
      .then(function getClient(_client) {
        window.client = _client;
        $("#sessionCreate").show();
        $("#sessionDetails,#errorMsg,#loading,#smsDetails, #assetList").hide();
        client.events.on("app.activated", onAppActivate);
      })
      .catch(handleErr);
  }
};

function onAppActivate() {
  getIparamData(function (data) {
    if (!data.isDeviceAccess) {
      $("#assetData").hide();
    }
  });
  getTicketDetails(function (ticketId) {
    getSessionCode(ticketId);
  });
}

const getIparamData = function (callback) {
  client.iparams.get().then(
    function (iparamData) {
      callback(iparamData);
    },
    function (error) {
      handleErr(error);
    }
  );
};

const getTicketDetails = function (callback) {
  client.data.get("ticket").then(
    function (data) {
      let ticketId = data.ticket.display_id;
      callback(ticketId);
    },
    function (error) {
      handleErr(error.message);
    }
  );
};

function getContactDetails() {
  client.data.get("requester").then(
    function (contactData) {
      let mobileNumber = contactData.requester.mobile;
      $("#mobile").val(mobileNumber);
    },
    function (error) {
      $("#mobileError").addClass("redColor").append(error.message);
      hideMessage("mobileError");
    }
  );
}

function getTicketDetailsByAPI(ticketId, value) {
  console.log("getTicketDetailsByAPI start", ticketId, value);
  getIparamData(function (data) {
    client.request
      .invokeTemplate("getTicketDetailsByAPI", {
        context: {
          host: data.fdurl,
          path: `/api/v2/tickets/${ticketId}?include=assets`,
        },
      })
      .then(function (response) {
        let parseResponse = JSON.parse(response.response);
        console.log("getTicketDetailsByAPI response", parseResponse);
        let assets = parseResponse.ticket.assets;
        if (assets.length > 0) {
          if (value === "assetData") {
            getListOfAssets(assets);
          } else if (value === "refreshList") {
            getAssetInTeamviewer(assets);
          }
        } else {
          $("#assetError").empty().append("No assets present");
          hideMessage("assetError");
          $("#assetData").prop("disabled", false);
        }
      })
      .catch(function (error) {
        console.log("error in getTicketDetailsByAPI", error);
        handleErr(error.response);
      });
  });
}

// click function to generate normal session.
$(document).on("click", ".generate", function () {
  $("#loading").show();
  $("#console, #sessionCreate").hide();
  getSession("regenarator");
});

// click function to generate Assist AR session.
$(document).on("click", ".arrgenerate", function () {
  $("#loading").show();
  $("#console, #sessionCreate").hide();
  $("#mobile").val("");
  getSession("arregenarator");
});

$(document).on("click", "#assetData", function () {
  $("#assetData").prop("disabled", true);
  getTicketDetails(function (ticketId) {
    getTicketDetailsByAPI(ticketId, "assetData");
  });
});

$(document).on("click", "#refreshList", function () {
  $("#assetList").hide();
  getTicketDetails(function (ticketId) {
    getTicketDetailsByAPI(ticketId, "refreshList");
  });
});

$(document).on("click", "#back", function () {
  $("#console, #sessionCreate").show();
  $("#sessionDetails,#errorMsg,#loading,#smsDetails,#assetList").hide();
});

//On click of Session Data button
$(document).on("click", "#sessionData", function () {
  $("#sessionData").prop("disabled", true);
  let sessionCode = $("#sessionCode").val();
  getSessionDetails(sessionCode);
});

//On click of Send SMS button
$(document).on("click", "#sms", function () {
  const mobileNumber = $.trim($("#mobile").val());
  if (mobileNumber != "") {
    sendSMS(mobileNumber);
  } else {
    $("#mobileError")
      .addClass("redColor")
      .append("Please provide mobile number");
    hideMessage("mobileError");
  }
});

//Generating session code
function getSession(sessionType) {
  getTicketDetails(function (ticketId) {
    let supportSession = "Default";
    if (sessionType == "arregenarator") {
      supportSession = "Pilot";
    }

    url = client.request.invokeTemplate("teamViewerSession", {
      context: {
        path: `/api/v1/sessions`,
      },
      body: JSON.stringify({
        groupname: "Freshservice",
        support_session_type: supportSession,
      }),
    });

    url.then(
      function (data) {
        console.log("get the sessions",data)
        let sessionData = JSON.parse(data.response);
        $("#errorMsg").html("");
        let replyData;
        if (sessionType == "arregenarator") {
          replyData = `<p>TeamViewer Assist AR Session Details </p><p><b>Session Code: ${sessionData.code}</b></p><br>
                         <p>Click the link below to start your assist AR session </p>
                         <p><a href=${sessionData.end_customer_link} target='_blank' rel="noreferrer"> 
                         ${sessionData.end_customer_link}</p>`;
        } else {
          replyData = `<p>TeamViewer Remote Session Details </p><p><b>Session Code: ${sessionData.code}</b></p><br>
                         <p>Click the link below to start your remote session </p>
                         <p><a href=${sessionData.end_customer_link} target='_blank' rel="noreferrer"> 
                         ${sessionData.end_customer_link}</p>`;
        }
        createNote(replyData);
        saveSessionCode(ticketId, sessionData.code);
        $("#sessionDetails, #console").show();
        $("#sData").html(sessionData.code);
        $("#sessionCode").empty().val(sessionData.code);
        if (sessionType == "arregenarator") {
          $("#smsDetails").show();
          getContactDetails();
        }
        $(`#sessionCreate,#loading, #arregenarator,#regenarator`).hide();
        $(`#${sessionType}`).show();
        var adminLink = `<i class="fa fa-external-link smallSize"></i></a><a class="smallSize" href="${sessionData.supporter_link}" target="_blank" rel="noreferrer">  Join this session`;
        $("#support_link").show().html(adminLink);
      },
      function (error) {
        let errMsg = JSON.parse(error.response).error_description;
        if (sessionType == "arregenarator") {
          handleErr(`There was no TeamViewer AR assist license found for the connected account.
 Please contact TeamViewer support if you want to use this feature`);
        } else {
          handleErr(errMsg);
        }
      }
    );
  });
}

//Fetch Session Details
function getSessionDetails(code) {
  console.log("session code --->",code);
  url = client.request.invokeTemplate("getSessionDetails", {
    context: {
      path: `/api/v1/reports/connections?session_code=${code}`,
    },
  });
  url.then(
    function (data) {

      console.log("get all the sessions",data)
      let result = JSON.parse(data.response),
        username,
        deviceid,
        devicename = "",
        start_date,
        end_date,
        session_code,
        duration,
        notes = "",
        noteData;
      if (result.records.length > 0) {
        if (result.records[0].end_date !== undefined) {
          username = result.records[0].username;
          deviceid = result.records[0].deviceid;
          start_date = result.records[0].start_date;
          end_date = result.records[0].end_date;
          session_code = result.records[0].session_code;
          if (
            result.records[0].devicename !== null &&
            result.records[0].devicename !== undefined
          ) {
            devicename = result.records[0].devicename;
          }
          if (
            result.records[0].notes !== null &&
            result.records[0].notes !== undefined
          ) {
            notes = result.records[0].notes;
          }
          const startDate = moment(start_date),
            endDate = moment(end_date),
            diff_day = endDate.diff(startDate, "day"),
            diff_hr = endDate.diff(startDate, "hour"),
            diff_min = endDate.diff(startDate, "minute"),
            diff_sec = endDate.diff(startDate, "second");
          duration = `${diff_day}d ${diff_hr}h ${diff_min}m ${diff_sec}s`;
          noteData = `<p>Below are the details of session : ${session_code}<p><br/>
                   User name: ${username}<br/>
                   Device id: ${deviceid}<br/>
                   Device name: ${devicename}<br/>
                   Start date: ${start_date}<br/>
                   End date: ${end_date}<br/>
                   Duration: ${duration}<br/>
                   Session code: ${session_code}<br/>
                   Notes: ${notes}<br/>`;
          createNoteByAPI(noteData);
        }
      } else {
        $("#sessionError")
          .empty()
          .addClass("redColor")
          .append("Session details not present");
        $("#sessionData").prop("disabled", false);
        hideMessage("sessionError");
      }
    },
    function (error) {
      const error_desc = JSON.parse(error.response).error_description;
      handleErr(error_desc);
    }
  );
}

//Send SMS call
function sendSMS(mobileNumber) {
  const sessionVal = $("#sessionCode").val(),
    url = client.request.invokeTemplate("teamViewerSendSMS", {
      context: {
        path: `/api/v1/sessions/${sessionVal}`,
      },
      body: JSON.stringify({
        sms_invite_number: mobileNumber,
      }),
    });

  url.then(
    function () {
      $("#mobileError").addClass("greenColor").append("SMS sent successfully");
      hideMessage("mobileError");
    },
    function (error) {
      const result = JSON.parse(error.response);
      $("#mobileError").addClass("redColor").append(result.error_description);
      hideMessage("mobileError");
    }
  );
}

//Fetch unattended asset from TeamViewer
function getAssetInTeamviewer(assets) {

console.log("{assets}",assets)
  url = client.request.invokeTemplate("getTeamviewerDevices", {
    context: {
      path: "/api/v1/devices",
    },
  });

  url.then(
    function (data) {
      console.log("getAssetInTeamviewer (or) getTeamviewerDevices",data)
      let deviceList = JSON.parse(data.response).devices,
        showDevicesArr = [];
      for (let i = 0; i < assets.length; i++) {
        const found = deviceList.find((el) => el.alias === assets[i].name);
        if (found !== undefined) {
          showDevicesArr.push(found);
        }
      }
      if (showDevicesArr.length > 0) {
        saveListOfAssets(showDevicesArr);
      }
    },
    function (error) {
      let errorResult = JSON.parse(error.response).error_description;
      handleErr(errorResult);
    }
  );
}

//show list of assets
function showListAssets(showDevicesArr) {
  console.log("{{showListAssets}}",showDevicesArr)
  $("#assetList").show();
  $("#assetData").prop("disabled", false);
  $("#assetLists").empty();
  if (showDevicesArr.length > 0) {
    showDevicesArr.forEach((item) => {
      let remoteId = item.remotecontrol_id.replace("r", "");
      $("#assetLists").append(
        `<li><a href="https://start.teamviewer.com/${remoteId}" target="_blank" rel="noreferrer">${item.alias} (${item.online_state})</li>`
      );
    });
  } else {
    $("#assetLists").append("Asset not present in Teamviewer");
  }
}

//Save session code in DB
function saveSessionCode(ticketId, sessionCode) {
  client.db.set(ticketId, { sessionCode: sessionCode }).then(
    function () {
      $("#sessionCode").empty().val(sessionCode);
      getSessionCode(ticketId);
    },
    function (error) {
      handleErr(error.message);
    }
  );
}

//Get session code from DB
function getSessionCode(ticketId) {
  client.db.get(ticketId).then(
    function (data) {
      $("#sessionData").prop("disabled", false);
      $("#sessionCode").empty().val(data.sessionCode);
    },
    function (error) {
      if (error.status === 404) {
        $("#sessionData").prop("disabled", true);
        $("#sessionError")
          .addClass("redColor")
          .append("No session id present to fetch details");
        hideMessage("sessionError");
      } else {
        handleErr(error.message);
      }
    }
  );
}

//Delete session code from DB
function deleteSessionCode(ticketId) {
  client.db.delete(ticketId).then(
    function () {
      $("#sessionCode").val("");
    },
    function (error) {
      handleErr(error.message);
    }
  );
}

//Save asset List
function saveListOfAssets(assets) {
  client.db.set("tvAssetList", { data: assets }).then(
    function (data) {
      getListOfAssets(data);
    },
    function (error) {
      handleErr(error.message);
    }
  );
}

//Get asset list
function getListOfAssets(assets) {

  client.db.get("tvAssetList").then(
    function (assetData) {
      showListAssets(assetData.data);
    },
    function () {
      getAssetInTeamviewer(assets);
    }
  );
}

function createNote(noteData) {
  client.interface
    .trigger("click", { id: "openReply", text: noteData })
    .then(function () {
      //Success block
    })
    .catch(function (error) {
      if (error !== undefined) {
        handleErr(error.message);
      }
    });
}

function createNoteByAPI(noteData) {
  getIparamData(function (data) {
    let fdurl = data.fdurl;
    console.log("freshservice url",fdurl);
    getTicketDetails(function (ticketId) {
      url = client.request.invokeTemplate("freshservicePost", {
        context: {
          path: `/api/v2/tickets/${ticketId}/notes`,
        },
        body: JSON.stringify({
          body: noteData,
          private: true,
        }),
      });
      url.then(
        function () {
          $("#sessionError")
            .addClass("greenColor")
            .append("Note created successfully");
          $("#sessionData").prop("disabled", true);
          hideMessage("sessionError");
          deleteSessionCode(ticketId);
        },
        function (error) {
          handleErr(error.response);
        }
      );
    });
  });
}

function handleErr(err) {
  $("#errorMsg").empty().append(err);
  $("#sessionDetails,#sessionCreate,#loading,#console,#assetList").hide();
  $("#errorMsg").show();
  setTimeout(function () {
    $("#sessionDetails,#errorMsg,#loading,#assetList").hide();
    $("#sessionCreate,#console").show();
    $("#sessionData").prop("disabled", false);
  }, 5000);
}

function hideMessage(id) {
  setTimeout(function () {
    $(`#${id}`).removeClass("redColor").empty();
  }, 5000);
}

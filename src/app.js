function ViewModel() {
    var self = this;

    self.nhsNumber = ko.observable("");
    self.patient = ko.observable(null);
    self.patientData = ko.observable(null);
    self.isReviewing = ko.observable(false);
    self.medicalMarkdown = ko.observable("");

    self.nhsNumber.subscribe(function() {
        self.patient(null);
        self.patientData(null);
        // Fetch patient ID here.
        $.getJSON("https://data.developer.nhs.uk/ccri-fhir/STU3/Patient?identifier=" + self.nhsNumber(), function(data) {
            patientData = data["entry"][0];
            if (patientData) {
                console.log(patientData["resource"]);
                self.patient(patientData["resource"]);
            }
        });
    });

    self.patientId = ko.computed(function() {
        if (!(patient = self.patient())) return null;
        console.log("patientId: " + patient["id"]);
        return patient["id"];
    });

    self.Patient = ko.computed(function() {
        if (!(patient = self.patient())) return null;

        console.log(patient["name"]);
        p = {
            "name": patient["name"][0]["given"][0] + " " + patient["name"][0]["family"],
            "birthDay": patient["birthDate"],
            "gender": patient["gender"],
            "gp": patient["generalPractitioner"][0]["display"],
            "confirmed": ko.observable(false),
        };

        p.confirm = function() {
            console.log("Confirm")
            this.confirmed(true);
        }.bind(p);

        return p;
    });
    
    ko.computed(function() {
        if (!(patient = self.Patient())) return;
        if (!(patientId = self.patientId())) return;

        console.log(patient);
        if (!patient.confirmed()) return;

        console.log("Fetch observations");

        $.getJSON("https://data.developer.nhs.uk/ccri-fhir/STU3/Patient?_id=" + patientId + "&_revinclude=*", function(data) {
            console.log(data);
            self.patientData(data);
        })
    })

    self.removedProcedures = ko.observable([]);
    self.removedAllergies = ko.observable([]);
    self.removedConditions = ko.observable([]);

    self.Encounters = ko.computed(function() {
        if (!(patientData = self.patientData())) return null;

        encounters = [];

        for(var entry of patientData["entry"]) {
            resource = entry["resource"];
            if (resource["resourceType"] == "Encounter") {
                encounter = {
                    "name": resource["type"]["0"]["coding"][0]["display"],
                };

                if (resource["period"]) {
                    encounter["dateEnd"] = timeago().format(resource["period"]["end"])
                } else {
                    encounter["dateEnd"] = "Date unknown"
                }

                encounters.push(encounter);

            }
        }

        return encounters;
    });

    self.EncounterIds = ko.computed(function() {
        if (!(patientData = self.patientData())) return null;

        ids = [];

        for(var entry of patientData["entry"]) {
            resource = entry["resource"];
            if (resource["resourceType"] == "Encounter") {
                ids.push("Encounter/" + resource["id"]);
            }
        }

        return ids;
    });

    self.Allergies = ko.computed(function() {
        if (!(patientData = self.patientData())) return null;

        allergies = [];

        for(var entry of patientData["entry"]) {
            resource = entry["resource"];
            if (resource["resourceType"] == "AllergyIntolerance" && !self.removedAllergies().includes(resource["id"])) {
                allergies.push({
                    "id": resource["id"],
                    "name": resource["code"]["coding"][0]["display"],
                    "date": timeago().format(resource["assertedDate"]),
                    "reviewed": ko.observable(true),
                });
            }
        }

        return allergies;
    });

    self.Conditions = ko.computed(function() {
        if (!(patientData = self.patientData())) return null;

        conditions = [];

        for(var entry of patientData["entry"]) {
            resource = entry["resource"];
            if (resource["resourceType"] == "Condition" && !self.removedConditions().includes(resource["id"])) {
                c = {
                    "id": resource["id"],
                    "name": resource["code"]["coding"][0]["display"],
                    "reviewed": ko.observable(true),
                    "encounterId": null,
                }
                if (resource["assertedDate"]) {
                    c["date"] = timeago().format(resource["assertedDate"])
                } else {
                    c["date"] = "Date unknown"
                }
                if (resource["context"]) {
                    c["encounterId"] = self.EncounterIds().indexOf(resource["context"]["reference"]) + 1
                }
                conditions.push(c);
            }
        }

        return conditions;
    });

    self.Procedures = ko.computed(function() {
        if (!(patientData = self.patientData())) return null;

        procs = [];

        for(var entry of patientData["entry"]) {
            resource = entry["resource"];
            if (resource["resourceType"] == "Procedure" && !self.removedProcedures().includes(resource["id"])) {
                procs.push({
                    "id": resource["id"],
                    "name": resource["code"]["coding"][0]["display"],
                    "reviewed": ko.observable(true),
                });
            }
        }

        return procs;
    });

    self.startReview = function() {
        self.isReviewing(true);
    };

    function findElementsToRemove(elements) {
        ids = [];
        for(var element of elements) {
            if (!element.reviewed()) {
                ids.push(element["id"]);
            }
        }
        return ids;
    }

    self.finishReview = function() {
        self.removedProcedures(findElementsToRemove(self.Procedures()));
        self.removedAllergies(findElementsToRemove(self.Allergies()));
        self.removedConditions(findElementsToRemove(self.Conditions()));

        self.isReviewing(false);
    };

    self.medicalMarkdown = ko.observable("");

    self.ParsedMedical = ko.computed(function() {
        linesRaw = self.medicalMarkdown();
        lines = linesRaw.split(/\r\n|\n|\r/);
        parsed = [];
        for(line of lines) {
            if (g = line.match("PR/ ([0-9]*) (reg)")) {
                parsed.push({
                    "title": "Pulse rate",
                    "value": "Rate " + g[1] + " ," + " regular"
                })
            } else if (g = line.match("AVPU/ ([AVPU]+)")) {
                value = ""
                switch (g[1]) {
                    case "A":
                        value = "Alert";
                        break;
                    case "V":
                        value = "Voice";
                        break;
                    case "P":
                        value = "Pain";
                        break;
                    case "U":
                        value = "Unresponsive";
                }
                parsed.push({
                    "title": "Alertness",
                    "value": value,
                })
            } else if (g = line.match("BP/ ([0-9]{2,3})[ /]{1}([0-9]{2,3})")) {
                parsed.push({
                    "title": "Blood Pressure",
                    "value": g[1] + " / " + g[2],
                })
            } else if (g = line.match("T/ ([0-9]{1,2})")) {
                parsed.push({
                    "title": "Temperature",
                    "value": g[1] + "C"
                })
            } else {
                parsed.push({
                    "title": "",
                    "value": line
                })
            }
        }
        console.log(parsed);
        return parsed;
    });
}

var vm = new ViewModel();


$(document).ready(function() {
    ko.applyBindings(vm);
});
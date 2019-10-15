function ViewModel() {
    var self = this;

    self.nhsNumber = ko.observable("");
    self.name = ko.observable("");

    self.patient = ko.observable(null);
    self.foundPatients = ko.observable(null);
    
    self.patientData = ko.observable(null);
    self.patientEncounters = ko.observable(null);

    self.nhsNumber.subscribe(function() {
        reset();
        // Fetch patient ID here.
        $.getJSON("https://data.developer.nhs.uk/ccri-fhir/STU3/Patient?identifier=" + self.nhsNumber(), function(data) {
            processPatients(data);
        });
    });    
    
    self.name.subscribe(function() {
        reset();
        // Fetch patients by name here.
        $.getJSON("https://data.developer.nhs.uk/ccri-fhir/STU3/Patient?name=" + self.name(), function(data) {
            processPatients(data);
        });
    });

    function processPatients(json) {
        foundPatients = [];
        for(var entry of json["entry"]) {
            foundPatients.push(buildPerson(entry["resource"]));
        } 
        self.foundPatients(foundPatients);
        
        console.log(foundPatients)
    }

    self.Patient = ko.computed(function() {
        if (!(patient = self.patient())) return null;

        p = {
            "name": patient["name"],
            "birthDay": patient["birthDay"],
            "gender": patient["gender"],
            "gp": patient["gp"]
        };
        return p;
    });

    self.patientId = ko.computed(function() {
        if (!(patient = self.patient())) return null;
        console.log(patient["id"]);
        return patient["id"];
    });
    
    ko.computed(function() {
        if (!(patient = self.patient())) return;
        if (!(patientId = self.patientId())) return;
        if (!patient.confirmed()) return;

        console.log("Fetch observations");

        $.getJSON("https://data.developer.nhs.uk/ccri-fhir/STU3/Patient?_id=" + patientId + "&_revinclude=*", function(data) {
            self.patientData(data);
        })

        $.getJSON("https://data.developer.nhs.uk/ccri-fhir/STU3/Encounter?patient=" + patientId, function(data) {
            self.patientEncounters(data);
        })
    })

    self.Encounters = ko.computed(function() {
        if (!(patientEncounters = self.patientEncounters())) return null;

        encounters = [];
        console.log(patientEncounters["entry"]);
        for(var entry of patientEncounters["entry"]) {
            resource = entry["resource"];
            encounter = {
                "name": resource["participant"][0]["individual"]["display"],
            };

            if (resource["period"]) {
                date = resource["period"]["end"];
                if (date == null) {
                    date = resource["period"]["start"];
                }
                encounter["date"] = timeago().format(date)
            } else {
                encounter["date"] = "Date unknown"
            }

            encounters.push(encounter);

        }

        return encounters;
    });

    self.Allergies = ko.computed(function() {
        if (!(patientData = self.patientData())) return null;

        allergies = [];

        for(var entry of patientData["entry"]) {
            resource = entry["resource"];
            if (resource["resourceType"] == "AllergyIntolerance") {
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

    function buildPerson(person) {
        gp = "Not Known";
        if (person["generalPractitioner"]) {
            gp = person["generalPractitioner"][0]["display"];
        }

        p = {
            "id": person["id"],
            "name": person["name"][0]["given"][0] + " " + person["name"][0]["family"],
            "birthDay": person["birthDate"],
            "gender": person["gender"],
            "gp": gp,
            "confirmed": ko.observable(false),
        };
    
        p.confirm = function() {
            self.foundPatients(null);
            this.confirmed(true);
            self.patient(this);
            console.log("Confirm");
        }.bind(p);
    
        return p;
    }  

    function reset() {
        self.patient(null);
        self.patientData(null);
        self.patientEncounters(null);
    }
}

var vm = new ViewModel();


$(document).ready(function() {
    ko.applyBindings(vm);
});
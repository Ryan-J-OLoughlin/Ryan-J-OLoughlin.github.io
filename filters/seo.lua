local site_url = "https://ryanoloughlin.org/"
local site_name = "Ryan O'Loughlin"

local same_as = {
  "https://scholar.google.com/citations?user=FVgAseQAAAAJ",
  "https://orcid.org/0000-0002-9106-1460",
  "https://philpeople.org/profiles/ryan-oloughlin",
  "https://www.linkedin.com/in/ryan-o-loughlin-885256300/",
  "https://github.com/Ryan-J-OLoughlin/"
}

local function stringify(value)
  if not value then
    return ""
  end
  return pandoc.utils.stringify(value)
end

function Meta(meta)
  local canonical = stringify(meta.canonical)
  local seo_type = stringify(meta.seo_type)
  local title = stringify(meta.title)
  local description = stringify(meta.description)

  local head_lines = {}

  if canonical ~= "" then
    table.insert(head_lines, string.format('<link rel="canonical" href="%s">', canonical))
    table.insert(head_lines, string.format('<meta property="og:url" content="%s">', canonical))
    table.insert(head_lines, string.format('<meta name="twitter:url" content="%s">', canonical))
  end

  local og_type = seo_type ~= "" and seo_type or "article"
  table.insert(head_lines, string.format('<meta property="og:type" content="%s">', og_type))
  table.insert(head_lines, '<meta property="og:locale" content="en_US">')

  local graph = {
    {
      ["@type"] = "WebSite",
      ["@id"] = site_url .. "#website",
      url = site_url,
      name = site_name,
      inLanguage = "en",
      publisher = {
        ["@id"] = site_url .. "#person"
      }
    },
    {
      ["@type"] = "Person",
      ["@id"] = site_url .. "#person",
      name = "Ryan J. O'Loughlin",
      url = site_url,
      image = site_url .. "assets/headshot.jpg",
      jobTitle = "Assistant Professor of Philosophy",
      worksFor = {
        ["@type"] = "CollegeOrUniversity",
        name = "Queens College, City University of New York",
        url = "https://www.qc.cuny.edu/"
      },
      affiliation = {
        ["@type"] = "Organization",
        name = "City University of New York"
      },
      sameAs = same_as
    }
  }

  if canonical ~= "" then
    local webpage = {
      ["@type"] = "WebPage",
      ["@id"] = canonical,
      url = canonical,
      name = title ~= "" and title or site_name,
      isPartOf = { ["@id"] = site_url .. "#website" },
      inLanguage = "en"
    }
    if description ~= "" then
      webpage.description = description
    end
    table.insert(graph, webpage)
  end

  local structured_data = {
    ["@context"] = "https://schema.org",
    ["@graph"] = graph
  }

  local json = quarto.json.encode(structured_data)
  table.insert(head_lines, string.format('<script type="application/ld+json">%s</script>', json))

  quarto.doc.include_text("in-header", table.concat(head_lines, '\n'))

  return meta
end

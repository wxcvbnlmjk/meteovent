import React from 'react'
import { useState, useEffect } from 'react'
import axios from 'axios'
import type { WeatherResponse, TimeData } from './types/weather'

function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return size
}

function App() {
  const [weatherData, setWeatherData] = useState<WeatherResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [searchCity, setSearchCity] = useState('')
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number }>({ lat: 45.1836, lon: 4.8494 })
  const [cityInfo, setCityInfo] = useState<{
    name: string;
    display_name: string;
    altitude: number;
  } | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const { width, height } = useWindowSize()

  const getElevation = async (lat: number, lon: number): Promise<number> => {
    try {
      const response = await axios.get(
        `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
      )
      if (response.data && response.data.elevation) {
        return response.data.elevation
      }
      return 0
    } catch (err) {
      console.error('Erreur lors de la récupération de l\'élévation:', err)
      return 0
    }
  }

  const searchCityCoordinates = async (city: string) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)},france&limit=1`
      )
      
      if (response.data && response.data.length > 0) {
        const result = response.data[0]
        const lat = parseFloat(result.lat)
        const lon = parseFloat(result.lon)
        const display_name = result.display_name
        
        // Obtenir l'élévation depuis Open-Meteo
        const altitude = await getElevation(lat, lon)
        
        setCoordinates({ lat, lon })
        setCityInfo({
          name: display_name.split(',')[0],
          display_name,
          altitude
        })
        setError(null)
      } else {
        setError('Ville non trouvée')
        setCityInfo(null)
      }
    } catch (err) {
      console.error('Erreur lors de la recherche de la ville:', err)
      setError('Erreur lors de la recherche de la ville')
      setCityInfo(null)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await axios.get<WeatherResponse>(
          `https://data0.meteo-parapente.com/data.php?run=2025052500&location=${coordinates.lat},${coordinates.lon}&date=${selectedDate.replace(/-/g, '')}&plot=windgram`
        )
        setWeatherData(response.data)
        setLoading(false)
      } catch (err) {
        console.error('Erreur détaillée:', err)
        setError('Erreur lors du chargement des données météorologiques')
        setLoading(false)
      }
    }

    fetchData()
  }, [coordinates, selectedDate])

  const calculateWindDirection = (umet: number, vmet: number): number => {
    // Conversion des composantes en degrés (0° = Nord, 90° = Est)
    const direction = Math.atan2(vmet, umet) * (180 / Math.PI)
    // Ajustement pour avoir 0° = Nord
    return (direction + 360) % 360
  }

  const getWindColor = (umet: number, vmet: number): string => {
    // Échelle de couleurs de l'arc-en-ciel
    const colors = [
      '#0000FF', // Bleu (0 km/h)
      '#00FFFF', // Cyan (20 km/h)
      '#00FF00', // Vert (40 km/h)
      '#FFFF00', // Jaune (60 km/h)
      '#FFA500', // Orange (80 km/h)
      '#FF0000', // Rouge (100 km/h)
      '#800080'  // Violet (120 km/h)
    ]

    // Calculer la vitesse du vent
    const speed = getWindSpeed(umet, vmet)
    
    // Normaliser la vitesse entre 0 et 1 (max 120 km/h)
    const normalizedSpeed = Math.min(speed / 120, 1)
    
    // Calculer l'index de couleur
    const colorIndex = Math.floor(normalizedSpeed * (colors.length - 1))
    
    // Calculer le ratio pour l'interpolation
    const ratio = normalizedSpeed * (colors.length - 1) - colorIndex
    
    // Interpoler entre les deux couleurs
    if (ratio === 0) return colors[colorIndex]
    
    const color1 = colors[colorIndex]
    const color2 = colors[colorIndex + 1]
    
    // Convertir les couleurs hex en RGB
    const r1 = parseInt(color1.slice(1, 3), 16)
    const g1 = parseInt(color1.slice(3, 5), 16)
    const b1 = parseInt(color1.slice(5, 7), 16)
    
    const r2 = parseInt(color2.slice(1, 3), 16)
    const g2 = parseInt(color2.slice(3, 5), 16)
    const b2 = parseInt(color2.slice(5, 7), 16)
    
    // Interpoler les composantes RGB
    const r = Math.round(r1 + (r2 - r1) * ratio)
    const g = Math.round(g1 + (g2 - g1) * ratio)
    const b = Math.round(b1 + (b2 - b1) * ratio)
    
    // Convertir en hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  const isColorDark = (color: string): boolean => {
    // Convertir la couleur hex en RGB
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    
    // Calculer la luminosité (formule de luminance relative)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    
    // Retourner true si la couleur est sombre
    return luminance < 0.5
  }

  const getWindSpeed = (umet: number, vmet: number): number => {
    // Calcul de la vitesse du vent en m/s
    const speed = Math.sqrt(umet * umet + vmet * vmet)
    // Conversion en km/h (1 m/s = 3.6 km/h)
    return Math.round(speed * 3.6)
  }

  const theme = {
    background: isDarkMode ? 'black' : 'white',
    text: isDarkMode ? 'white' : 'black',
    secondaryBackground: isDarkMode ? '#1a1a1a' : '#f8f9fa',
    border: isDarkMode ? '#333' : '#ddd',
    inputBackground: isDarkMode ? '#1a1a1a' : 'white',
    buttonBackground: isDarkMode ? '#007bff' : '#0056b3',
    error: '#ff4444'
  }

  if (loading) return <div className="flex justify-center items-center h-screen">Chargement...</div>
  if (error) return <div className="flex justify-center items-center h-screen text-red-500">{error}</div>
  if (!weatherData) return null

  const times = Object.keys(weatherData.data)
  const altitudes = [...weatherData.data[times[0]].z].reverse()

  const calculateArrowSize = () => {
    // Calculer la taille maximale disponible pour le tableau
    const maxWidth = Math.min(width * 0.5, 800) // 50% de la largeur de l'écran, max 800px
    const maxHeight = height - 200 // Espace pour le titre et les contrôles

    // Calculer le nombre de colonnes et de lignes
    const numColumns = times.length + 1 // +1 pour la colonne d'altitude
    const numRows = altitudes.length

    // Calculer la taille maximale possible pour chaque cellule
    const maxCellWidth = (maxWidth - 40) / (numColumns - 1) // Soustraire la largeur de la colonne d'altitude
    const maxCellHeight = maxHeight / numRows

    // Prendre la plus petite des deux dimensions pour garder les flèches carrées
    const arrowSize = Math.min(maxCellWidth, maxCellHeight) * 1.6 // 160% de la taille de la cellule

    // Limiter la taille minimale et maximale
    return Math.max(16, Math.min(200, arrowSize))
  }

  const arrowSize = calculateArrowSize()
  const fontSize = Math.max(8, Math.min(16, arrowSize / 4))

  return (
    <div style={{ 
      width: '100%',
      height: '100vh',
      margin: 0,
      padding: 0,
      backgroundColor: theme.background,
      color: theme.text,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h1 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 'bold', 
        textAlign: 'center',
        margin: '16px 0',
        padding: 0
      }}>Météo des Vents</h1>
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '0 16px',
        flex: '0 0 auto'
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <input
            type="text"
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            placeholder="Rechercher une ville..."
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBackground,
              color: theme.text,
              width: '200px',
              flex: '1 1 200px'
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                searchCityCoordinates(searchCity)
              }
            }}
          />
          <button
            onClick={() => searchCityCoordinates(searchCity)}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              backgroundColor: theme.buttonBackground,
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              flex: '0 0 auto'
            }}
          >
            Rechercher
          </button>
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.inputBackground,
              color: theme.text,
              cursor: 'pointer',
              marginBottom: '8px',
              flex: '1 1 200px'
            }}
          />
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              backgroundColor: theme.buttonBackground,
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '8px',
              flex: '0 0 auto'
            }}
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          color: theme.error,
          textAlign: 'center',
          padding: '0 16px',
          flex: '0 0 auto'
        }}>
          {error}
        </div>
      )}

      {cityInfo && (
        <div style={{
          textAlign: 'center',
          padding: '8px 16px',
          flex: '0 0 auto'
        }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{cityInfo.name}</div>
          <div style={{ color: theme.text, fontSize: '0.9rem' }}>{cityInfo.display_name}</div>
          <div style={{ color: theme.text }}>Altitude : {Math.round(cityInfo.altitude)} m</div>
        </div>
      )}

      <div style={{ 
        flex: '1 1 auto',
        overflow: 'hidden',
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          position: 'relative',
          flex: '1 1 auto',
          overflow: 'hidden',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%'
        }}>
          <table style={{ 
            width: '100%', 
            backgroundColor: theme.background, 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            borderCollapse: 'separate',
            borderSpacing: 0,
            tableLayout: 'fixed'
          }}>
            <thead style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              backgroundColor: theme.background
            }}>
              <tr>
                <th style={{ 
                  padding: '2px', 
                  textAlign: 'left', 
                  backgroundColor: theme.background, 
                  fontSize: '8px',
                  color: theme.text,
                  borderBottom: `1px solid ${theme.border}`,
                  width: '40px'
                }}>Altitude (m)</th>
                {times.map((time) => (
                  <th key={time} style={{ 
                    padding: '0px', 
                    textAlign: 'center', 
                    backgroundColor: theme.background, 
                    fontSize: '8px',
                    color: theme.text,
                    borderBottom: `1px solid ${theme.border}`,
                    width: `${arrowSize + 4}px`
                  }}>
                    {time}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
          <div style={{
            overflowY: 'auto',
            height: 'calc(100% - 25px)'
          }}>
            <table style={{ 
              width: '100%', 
              backgroundColor: theme.background, 
              borderCollapse: 'separate',
              borderSpacing: 0,
              tableLayout: 'fixed'
            }}>
              <tbody>
                {altitudes.map((altitude, index) => {
                  const reverseIndex = weatherData.data[times[0]].z.length - 1 - index
                  
                  return (
                    <tr key={index} style={{ borderTop: `1px solid ${theme.border}` }}>
                      <td style={{ 
                        padding: '2px', 
                        fontSize: '8px',
                        color: theme.text,
                        width: '40px'
                      }}>{Math.round(altitude)}</td>
                      {times.map((time) => {
                        const timeData = weatherData.data[time]
                        const umet = timeData.umet[reverseIndex]
                        const vmet = timeData.vmet[reverseIndex]
                        const thr = timeData.thr[reverseIndex]
                        const ths = timeData.ths[reverseIndex]
                        const direction = calculateWindDirection(umet, vmet)
                        const speed = getWindSpeed(umet, vmet)
                        
                        return (
                          <td key={time} style={{ 
                            padding: '2px', 
                            textAlign: 'center',
                            width: `${arrowSize + 4}px`
                          }}>
                            <div 
                              style={{ 
                                display: 'inline-block', 
                                padding: '2px' 
                              }}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setTooltip({
                                  x: rect.left + rect.width / 2,
                                  y: rect.top - 10,
                                  text: `${speed} km/h`
                                })
                              }}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              <div 
                                style={{ 
                                  position: 'relative', 
                                  margin: '0 auto',
                                  width: arrowSize,
                                  height: arrowSize
                                }}
                              >
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    transform: `rotate(${direction}deg)`,
                                    transition: 'transform 0.3s ease'
                                  }}
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    style={{
                                      width: '100%',
                                      height: '100%'
                                    }}
                                    fill={getWindColor(umet, vmet)}
                                  >
                                    <path d="M12 2L4 12h4v10h8V12h4L12 2z" />
                                  </svg>
                                  <div 
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transform: `rotate(${-direction}deg)`,
                                      fontSize: `${fontSize}px`,
                                      color: isColorDark(getWindColor(umet, vmet)) ? 'white' : 'black',
                                      textShadow: '0 0 2px black'
                                    }}
                                  >
                                    {speed}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            backgroundColor: theme.secondaryBackground,
            color: theme.text,
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            pointerEvents: 'none',
            zIndex: 50,
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

export default App

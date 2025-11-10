/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';

const DEFAULT_PROMPT = 'Improve image quality, lighting, sharpness, color, and details without making it look artificial. Enhance the photo to make it look its best while maintaining a natural appearance.';

const ApiKeySelector = ({ onKeySelected }) => {
    const handleSelectKey = async () => {
        // The `openSelectKey` function shows a dialog for the user to select their key.
        await window.aistudio.openSelectKey();
        // After the dialog is closed, we assume a key was selected and update the app state.
        // This helps avoid race conditions where `hasSelectedApiKey` might not be immediately true.
        onKeySelected();
    };

    return (
        <div className="api-key-selector-container">
            <div className="api-key-selector">
                <h2>Select Your API Key to Begin</h2>
                <p>To use the Photo Enhancer, you need to provide a Google AI Studio API key. Your key is stored locally in your browser and is only used for the requests you make.</p>
                <button onClick={handleSelectKey} className="btn btn-primary btn-large">
                    Select API Key
                </button>
                <p className="billing-info">
                    You must use an API key from a project with billing enabled.
                    {' '}
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">
                        Learn more
                    </a>.
                </p>
            </div>
        </div>
    );
};


const App = () => {
    const [apiKeyReady, setApiKeyReady] = useState(false);
    const [showLanding, setShowLanding] = useState(true);
    const [activeMode, setActiveMode] = useState<'enhancer' | 'remover'>('enhancer');
    
    // Enhancer State
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFaceEnhancementEnabled, setIsFaceEnhancementEnabled] = useState(false);
    const [isRestoreEnabled, setIsRestoreEnabled] = useState(false);
    const [isDeblurEnabled, setIsDeblurEnabled] = useState(false);
    const [upscaleFactor, setUpscaleFactor] = useState<string>('none');
    
    // Background Remover State
    const [bgOriginalImage, setBgOriginalImage] = useState<string | null>(null);
    const [bgImageFile, setBgImageFile] = useState<File | null>(null);
    const [bgRemovedImage, setBgRemovedImage] = useState<string | null>(null);
    const [bgIsLoading, setBgIsLoading] = useState(false);
    const [bgError, setBgError] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const MAX_FILE_SIZE_MB = 10;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    
    useEffect(() => {
        const checkApiKey = async () => {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            setApiKeyReady(hasKey);
        };
        checkApiKey();
    }, []);

    // Convert file to base64 (reusable)
    const fileToGenerativePart = async (file: File) => {
        const base64EncodedDataPromise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
        });
        return {
            inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
        };
    };

    // --- Enhancer Handlers ---
    const handleImageUpload = (file: File) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please upload a valid image file (JPG, PNG, WEBP).');
            return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            setError(`File size exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
            return;
        }

        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setOriginalImage(reader.result as string);
            setEnhancedImage(null);
            setError(null);
            setPrompt(DEFAULT_PROMPT);
            setIsFaceEnhancementEnabled(false);
            setIsRestoreEnabled(false);
            setIsDeblurEnabled(false);
            setUpscaleFactor('none');
        };
        reader.readAsDataURL(file);
    };

    const handleEnhanceClick = async () => {
        if (!imageFile || !prompt) return;

        setIsLoading(true);
        setError(null);
        setEnhancedImage(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const imagePart = await fileToGenerativePart(imageFile);

            let finalPrompt = prompt;

            if (upscaleFactor !== 'none') {
                finalPrompt += ` Increase the resolution of the image by ${upscaleFactor} while keeping details sharp and natural.`;
            }
             if (isDeblurEnabled) {
                finalPrompt += ` This is a high-priority instruction: Remove all types of blur from the image, including motion blur, focus blur, and camera shake. The final image must be exceptionally sharp and clear, with all details brought into crisp focus.`;
            }
            if (isRestoreEnabled) {
                finalPrompt += ` Perform an expert-level, full restoration of this photograph. This is a high-priority instruction. Your task is to meticulously repair all signs of damage and degradation.
1. **Fix Physical Damage:** Completely remove all scratches, tears, creases, stains, and water damage.
2. **Correct Blur & Sharpness:** This is critical. Analyze the image for any blurriness (motion blur, out-of-focus areas) and apply advanced sharpening techniques to bring all details into sharp, clear focus.
3. **Remove Noise & Artifacts:** Eliminate all digital noise, film grain, and compression artifacts (like JPEG blocking).
4. **Restore Colors:** Correct any color fading, yellowing, or discoloration. Restore the original, vibrant, and accurate colors.
5. **Final Output:** The result must be a clean, sharp, fully restored image that looks like it was captured with a modern, high-resolution digital camera. Do not leave any original flaws.`;
            }
            if (isFaceEnhancementEnabled) {
                finalPrompt += ' Generate an ultra-realistic face. Focus on hyper-detailed skin texture, including pores and fine lines. Create lifelike eyes with natural depth and reflections. Render individual hair and eyebrow strands with sharp precision. The result should be indistinguishable from a high-resolution photograph.';
            }

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        imagePart,
                        { text: finalPrompt },
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });
            
            const parts = response.candidates?.[0]?.content?.parts;
            let foundImage = false;

            if (Array.isArray(parts)) {
                for (const part of parts) {
                    if (part.inlineData) {
                        const base64Image = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType;
                        setEnhancedImage(`data:${mimeType};base64,${base64Image}`);
                        foundImage = true;
                        break;
                    }
                }
            }

            if (!foundImage) {
                const textResponse = response.text?.trim() || "No text response.";
                throw new Error(`The AI did not return an image. Response: "${textResponse}"`);
            }

        } catch (e) {
            console.error(e);
            const errorMessage = e.message || String(e);
             if (errorMessage.includes('API Key must be set') || errorMessage.includes('Requested entity was not found')) {
                setError("Your API Key is not valid or has been revoked. Please select a new key to continue.");
                setApiKeyReady(false);
            } else {
                setError(`An error occurred during enhancement: ${errorMessage}`);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleReset = () => {
        setOriginalImage(null);
        setImageFile(null);
        setEnhancedImage(null);
        setError(null);
        setIsLoading(false);
        setPrompt(DEFAULT_PROMPT);
        setIsFaceEnhancementEnabled(false);
        setIsRestoreEnabled(false);
        setIsDeblurEnabled(false);
        setUpscaleFactor('none');
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    // --- Background Remover Handlers ---
    const handleBgImageUpload = (file: File) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setBgError('Please upload a valid image file (JPG, PNG, WEBP).');
            return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            setBgError(`File size exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
            return;
        }

        setBgImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setBgOriginalImage(reader.result as string);
            setBgRemovedImage(null);
            setBgError(null);
        };
        reader.readAsDataURL(file);
    };
    
    const handleRemoveBackgroundClick = async () => {
        if (!bgImageFile) return;

        setBgIsLoading(true);
        setBgError(null);
        setBgRemovedImage(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const imagePart = await fileToGenerativePart(bgImageFile);
            const bgRemovePrompt = 'CRITICAL TASK: Your only job is to remove the background from this image. The main subject must be perfectly isolated with clean edges. The output format MUST be a PNG with a fully transparent (alpha) background. Do not output any other format or any background color.';

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [imagePart, { text: bgRemovePrompt }],
                },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });

            const parts = response.candidates?.[0]?.content?.parts;
            let foundImage = false;

            if (Array.isArray(parts)) {
                for (const part of parts) {
                    if (part.inlineData) {
                        const base64Image = part.inlineData.data;
                        // Force PNG mimeType for transparency, as requested by the model prompt.
                        const mimeType = 'image/png';
                        setBgRemovedImage(`data:${mimeType};base64,${base64Image}`);
                        foundImage = true;
                        break;
                    }
                }
            }

             if (!foundImage) {
                const textResponse = response.text?.trim() || "No text response.";
                throw new Error(`The AI did not return an image. Response: "${textResponse}"`);
            }

        } catch (e) {
            console.error(e);
            const errorMessage = e.message || String(e);
            if (errorMessage.includes('API Key must be set') || errorMessage.includes('Requested entity was not found')) {
                setBgError("Your API Key is not valid or has been revoked. Please select a new key to continue.");
                setApiKeyReady(false);
            } else {
                setBgError(`An error occurred: ${errorMessage}`);
            }
        } finally {
            setBgIsLoading(false);
        }
    };
    
    const handleBgReset = () => {
        setBgOriginalImage(null);
        setBgImageFile(null);
        setBgRemovedImage(null);
        setBgError(null);
        setBgIsLoading(false);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    if (!apiKeyReady) {
        return <ApiKeySelector onKeySelected={() => setApiKeyReady(true)} />;
    }

    if (showLanding) {
        return <LandingPage onGetStarted={() => setShowLanding(false)} />;
    }

    return (
        <div className="app-container">
            <header>
                 <h1>
                    {activeMode === 'enhancer' ? 'AI Photo Enhancer & Upscaler' : 'AI Photo Background Remover'}
                </h1>
                <p>
                    {activeMode === 'enhancer' 
                        ? 'Upload a photo and use AI to improve its quality, sharpness, and color in seconds.'
                        : 'Upload an image to automatically and accurately remove the background.'
                    }
                </p>
                <nav className="header-nav">
                    <button 
                        onClick={() => setActiveMode('enhancer')} 
                        className={activeMode === 'enhancer' ? 'active' : ''}
                        aria-pressed={activeMode === 'enhancer'}
                    >
                        Photo Enhancer
                    </button>
                    <button 
                        onClick={() => setActiveMode('remover')} 
                        className={activeMode === 'remover' ? 'active' : ''}
                        aria-pressed={activeMode === 'remover'}
                    >
                        Background Remover
                    </button>
                </nav>
            </header>
            <main>
                {activeMode === 'enhancer' ? (
                    <>
                        {!originalImage ? (
                            <UploadComponent onImageUpload={handleImageUpload} fileInputRef={fileInputRef} />
                        ) : (
                            <EditorComponent
                                originalImage={originalImage}
                                enhancedImage={enhancedImage}
                                prompt={prompt}
                                setPrompt={setPrompt}
                                isLoading={isLoading}
                                onEnhance={handleEnhanceClick}
                                onReset={handleReset}
                                isFaceEnhancementEnabled={isFaceEnhancementEnabled}
                                setIsFaceEnhancementEnabled={setIsFaceEnhancementEnabled}
                                isRestoreEnabled={isRestoreEnabled}
                                setIsRestoreEnabled={setIsRestoreEnabled}
                                isDeblurEnabled={isDeblurEnabled}
                                setIsDeblurEnabled={setIsDeblurEnabled}
                                upscaleFactor={upscaleFactor}
                                setUpscaleFactor={setUpscaleFactor}
                            />
                        )}
                         {error && <p className="error-message">{error}</p>}
                    </>
                ) : (
                    <BackgroundRemoverComponent
                        originalImage={bgOriginalImage}
                        removedImage={bgRemovedImage}
                        isLoading={bgIsLoading}
                        error={bgError}
                        onImageUpload={handleBgImageUpload}
                        onRemoveBackground={handleRemoveBackgroundClick}
                        onReset={handleBgReset}
                        fileInputRef={fileInputRef}
                    />
                )}
            </main>
        </div>
    );
};

const LandingPage = ({ onGetStarted }) => {
    return (
        <div className="landing-container">
            <header className="landing-header">
                <h1>Unleash Your Photos' True Potential</h1>
                <p>Effortlessly enhance quality, upscale resolution, and remove backgrounds with the power of AI. Completely free, with unlimited use.</p>
                <button onClick={onGetStarted} className="btn btn-primary btn-large">Get Started for Free</button>
            </header>

            <section className="landing-section">
                <h2>How to Use</h2>
                <div className="steps-container">
                    <div className="step-card">
                        <div className="step-icon">1</div>
                        <h3>Upload Your Image</h3>
                        <p>Drag & drop or select any image from your device.</p>
                    </div>
                    <div className="step-card">
                        <div className="step-icon">2</div>
                        <h3>Customize & Enhance</h3>
                        <p>Choose your enhancement options and let the AI work its magic.</p>
                    </div>
                    <div className="step-card">
                        <div className="step-icon">3</div>
                        <h3>Download</h3>
                        <p>Download your perfected, high-resolution image in seconds.</p>
                    </div>
                </div>
            </section>

            <section className="landing-section">
                <h2>Why Use Our AI Toolkit?</h2>
                <div className="features-container">
                    <div className="feature-card">
                        <h3>Powerful AI Enhancer</h3>
                        <p>Fix lighting, sharpen details, restore colors, and upscale resolution for a professional look.</p>
                    </div>
                    <div className="feature-card">
                        <h3>Precise Background Remover</h3>
                        <p>Instantly create transparent backgrounds with clean, accurate cutouts for any project.</p>
                    </div>
                    <div className="feature-card">
                        <h3>Free for Everyone</h3>
                        <p>Why is it free? We believe everyone should have access to powerful creative tools. No subscriptions, no watermarks, and no hidden fees. Ever.</p>
                    </div>
                    <div className="feature-card">
                        <h3>Unlimited Enhancements</h3>
                        <p>If it doesn't work the first time, try again! There are no limits on retries, so you can experiment until your photo is absolutely perfect.</p>
                    </div>
                </div>
            </section>
        </div>
    );
};

const UploadComponent = ({ onImageUpload, fileInputRef }) => {
    const [isDragging, setIsDragging] = useState(false);
    
    const handleDragEvents = (e, dragging) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(dragging);
    };
    
    const handleDrop = (e) => {
        handleDragEvents(e, false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onImageUpload(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };
    
    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onImageUpload(e.target.files[0]);
        }
    };

    return (
        <div 
            className={`upload-container ${isDragging ? 'drag-over' : ''}`}
            onDragEnter={(e) => handleDragEvents(e, true)}
            onDragLeave={(e) => handleDragEvents(e, false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
            role="button"
            tabIndex={0}
            aria-label="Image upload area"
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/png, image/jpeg, image/webp"
                style={{ display: 'none' }}
                aria-hidden="true"
            />
            <UploadIcon />
            <h2>Drag & drop or click to upload</h2>
            <p>Supported formats: JPG, PNG, WEBP. Max size: 10MB.</p>
            <button type="button" className="upload-button" aria-label="Select an image to upload from your device">
                Browse Files
            </button>
        </div>
    );
};

const EditorComponent = ({
    originalImage,
    enhancedImage,
    prompt,
    setPrompt,
    isLoading,
    onEnhance,
    onReset,
    isFaceEnhancementEnabled,
    setIsFaceEnhancementEnabled,
    isRestoreEnabled,
    setIsRestoreEnabled,
    isDeblurEnabled,
    setIsDeblurEnabled,
    upscaleFactor,
    setUpscaleFactor,
}) => {
    const upscaleOptions = ['none', '2x', '4x', '8x', '16x', '32x'];
    return (
        <div className="editor-container">
            <div className="preview-area">
                 <ReactCompareSlider
                    aria-label="Image comparison slider"
                     handle={
                         <div style={{ width: '3px', height: '100%', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <div style={{ border: '2px solid white', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px', color: 'white' }}>
                                     <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                                 </svg>
                             </div>
                         </div>
                     }
                    itemOne={
                        <div className="image-wrapper">
                            <ReactCompareSliderImage src={originalImage} alt="Original" />
                            <span className="image-label">Original</span>
                        </div>
                    }
                    itemTwo={
                        <div className="image-wrapper">
                            {enhancedImage ? (
                                <ReactCompareSliderImage src={enhancedImage} alt="Enhanced" />
                            ) : (
                                <div className="placeholder"></div>
                            )}
                             <span className="image-label">Enhanced</span>
                            {isLoading && (
                               <div className="loading-overlay">
                                   <div className="spinner"></div>
                                   <p>Enhancing image...</p>
                               </div>
                            )}
                        </div>
                    }
                />
            </div>
            <aside className="controls-area">
                 <div className="control-group">
                    <div className="toggle-container">
                        <label htmlFor="face-enhance-toggle" className="toggle-label">Enable Face Enhancement</label>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                id="face-enhance-toggle"
                                checked={isFaceEnhancementEnabled}
                                onChange={(e) => setIsFaceEnhancementEnabled(e.target.checked)}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <p className="toggle-description">
                        Generates an ultra-realistic face with hyper-detailed features. Best for portraits.
                    </p>
                </div>
                <div className="control-group">
                    <div className="toggle-container">
                        <label htmlFor="restore-image-toggle" className="toggle-label">Restore Photo</label>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                id="restore-image-toggle"
                                checked={isRestoreEnabled}
                                onChange={(e) => setIsRestoreEnabled(e.target.checked)}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <p className="toggle-description">
                       Repair old, damaged photos by removing scratches, noise, and artifacts.
                    </p>
                </div>
                 <div className="control-group">
                    <div className="toggle-container">
                        <label htmlFor="deblur-image-toggle" className="toggle-label">Remove Blur</label>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                id="deblur-image-toggle"
                                checked={isDeblurEnabled}
                                onChange={(e) => setIsDeblurEnabled(e.target.checked)}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <p className="toggle-description">
                       Significantly reduces motion blur and out-of-focus areas for a sharper image.
                    </p>
                </div>
                <div className="control-group">
                    <label>Upscale Resolution</label>
                    <div className="upscale-options">
                        {upscaleOptions.map(factor => (
                            <button
                                key={factor}
                                className={`upscale-btn ${upscaleFactor === factor ? 'active' : ''}`}
                                onClick={() => setUpscaleFactor(factor)}
                                aria-pressed={upscaleFactor === factor}
                            >
                                {factor === 'none' ? 'None' : factor}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="control-group">
                    <label htmlFor="prompt">Enhancement Instructions</label>
                    <textarea 
                        id="prompt"
                        className="prompt-input"
                        rows={4}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Make the colors more vibrant and increase sharpness"
                        aria-label="Enter instructions for image enhancement"
                    />
                </div>
                <div className="action-buttons">
                    <button onClick={onEnhance} className="btn btn-primary" disabled={isLoading || !prompt.trim()}>
                        {isLoading ? 'Processing...' : 'Enhance & Upscale'}
                    </button>
                    {enhancedImage && (
                        <a href={enhancedImage} download="enhanced-image.png" className="btn btn-secondary">
                           Download Image
                        </a>
                    )}
                    <button onClick={onReset} className="btn btn-secondary">
                        Upload New Image
                    </button>
                </div>
            </aside>
        </div>
    );
};

const BackgroundRemoverComponent = ({ originalImage, removedImage, isLoading, error, onImageUpload, onRemoveBackground, onReset, fileInputRef }) => {
    if (!originalImage) {
        return <UploadComponent onImageUpload={onImageUpload} fileInputRef={fileInputRef} />;
    }

    return (
        <div className="bg-remover-container">
            <div className="preview-area">
                <ReactCompareSlider
                    aria-label="Image comparison slider for background removal"
                    handle={
                         <div style={{ width: '3px', height: '100%', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <div style={{ border: '2px solid white', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '20px', height: '20px', color: 'white' }}>
                                     <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                                 </svg>
                             </div>
                         </div>
                     }
                    itemOne={
                        <div className="image-wrapper">
                            <ReactCompareSliderImage src={originalImage} alt="Original" />
                            <span className="image-label">Original</span>
                        </div>
                    }
                    itemTwo={
                        <div className="image-wrapper checkerboard-bg">
                            {removedImage ? (
                                <ReactCompareSliderImage src={removedImage} alt="Background Removed" />
                            ) : (
                                <div className="placeholder"></div>
                            )}
                             <span className="image-label">Result</span>
                            {isLoading && (
                               <div className="loading-overlay">
                                   <div className="spinner"></div>
                                   <p>Removing background...</p>
                               </div>
                            )}
                        </div>
                    }
                />
            </div>
            <div className="bg-remover-actions">
                <button onClick={onRemoveBackground} className="btn btn-primary" disabled={isLoading}>
                    {isLoading ? 'Processing...' : 'Remove Background'}
                </button>
                {removedImage && (
                    <a href={removedImage} download="background-removed.png" className="btn btn-secondary">
                       Download Transparent Image
                    </a>
                )}
                <button onClick={onReset} className="btn btn-secondary">
                    Upload New Image
                </button>
            </div>
            {error && <p className="error-message" style={{ width: '100%', maxWidth: '900px' }}>{error}</p>}
        </div>
    );
};

const UploadIcon = () => (
    <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
);


const root = createRoot(document.getElementById('root'));
root.render(<App />);